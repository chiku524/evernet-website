import 'dotenv/config'
import cors from 'cors'
import express, { type Response } from 'express'
import multer from 'multer'
import {
  buildChallenge,
  isStellarAddress,
  requireWallet,
  verifyChallengeAndIssueToken,
  type AuthedRequest,
} from './auth.js'
import { driver } from './blobstore.js'
import { config } from './config.js'
import { verifyStoragePayment } from './payments.js'
import {
  creditPurchaseOnChain,
  deleteObjectOnChain,
  getMergedProfile,
  onChainEnabled,
} from './soroban.js'
import { normalizeFolderPath } from './paths.js'
import { createApiKey, listApiKeys, revokeApiKey } from './apikeys.js'
import { openApiSpec } from './openapi.js'
import {
  archiveProject,
  createProject,
  debitProjectUpload,
  getProject,
  listProjects,
  updateProject,
} from './projects.js'
import { ingestObject } from './ingest.js'
import { publicObject, publicObjects } from './publicMeta.js'
import { REQUESTS_PER_MINUTE, rateLimit } from './ratelimit.js'
import { s3Router } from './s3.js'
import {
  TRASH_TTL_MS,
  createFolder,
  deleteFolder,
  deleteObjectLocal,
  getObject,
  listFolders,
  listObjects,
  readBlob,
  patchObjectMeta,
  purgeExpiredTrash,
  renameFolder,
  restoreObject,
  trashObject,
  type StoredObjectMeta,
} from './store.js'

const API_VERSION = '1'

const explicitOrigins = config.corsOrigin
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)

/**
 * Dev servers pick whatever port is free and Vercel previews get a fresh
 * hostname per deploy, so pinning an exact list guarantees breakage. Allow the
 * Evernet domains, any of our Vercel preview URLs, and localhost on any port.
 */
function allowedOrigin(origin: string | undefined, done: (err: Error | null, ok?: boolean) => void) {
  if (!origin) return done(null, true)
  if (explicitOrigins.includes(origin)) return done(null, true)
  try {
    const { hostname, protocol } = new URL(origin)
    const local =
      hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
    const evernet = hostname === 'evernet.tech' || hostname.endsWith('.evernet.tech')
    const preview = hostname.endsWith('.vercel.app')
    if ((local && protocol === 'http:') || ((evernet || preview) && protocol === 'https:')) {
      return done(null, true)
    }
  } catch {
    /* malformed origin */
  }
  return done(null, false)
}

const app = express()
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 80 * 1024 * 1024 },
})

/**
 * Responses must never be cached. A cached entry from a deploy with different
 * CORS headers keeps being replayed by the browser, which then reports the API
 * as unreachable long after the server was fixed.
 */
app.disable('etag')
app.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, max-age=0')
  res.setHeader('X-Evernet-Api-Version', API_VERSION)
  next()
})
app.use(cors({ origin: allowedOrigin }))

/** Raw bodies for S3-shaped PUT (must run before JSON parser). */
app.use((req, res, next) => {
  if (req.method !== 'PUT') return next()
  if (req.path === '/s3/v1/object') {
    return express.raw({ type: '*/*', limit: '80mb' })(req, res, next)
  }
  if (/^\/s3\/v1\/multipart\/[^/]+\/\d+$/.test(req.path)) {
    return express.raw({ type: '*/*', limit: '16mb' })(req, res, next)
  }
  next()
})

app.use(express.json({ limit: '2mb' }))
app.use(rateLimit)

app.get('/', (_req, res) => {
  res.json({
    name: 'Evernet Storage API',
    version: API_VERSION,
    docs: 'https://evernet.tech/docs#api',
    cloud: 'https://evernet.tech/docs#cloud',
    openapi: '/openapi.json',
    health: '/health',
    status: '/status',
    config: '/config/public',
    s3: '/s3/v1',
  })
})

app.use('/s3/v1', s3Router)

app.get('/openapi.json', (_req, res) => {
  res.json(openApiSpec)
})

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    version: API_VERSION,
    network: config.network,
    onChain: onChainEnabled(),
    contractId: config.contractId || null,
    treasury: config.treasuryPublic,
    storage: driver.name,
  })
})

/** Public readiness / capability status (no auth). */
app.get('/status', (_req, res) => {
  const network = config.network
  const onChain = onChainEnabled()
  res.json({
    ok: true,
    apiVersion: API_VERSION,
    s3Version: '4',
    network,
    storageDriver: driver.name,
    onChain,
    contractId: config.contractId || null,
    treasury: config.treasuryPublic,
    trashTtlMs: TRASH_TTL_MS,
    capabilities: {
      s3Shaped: true,
      softDelete: true,
      batchDelete: true,
      multipart: true,
      presignedGet: true,
      shareGrants: true,
      rangedGet: true,
      ifNoneMatch: true,
      versioning: true,
      lifecycle: true,
    },
    mainnet: {
      paymentsSupported: true,
      storageContractDeployed: network === 'public' && onChain,
      readiness:
        network === 'public' && onChain
          ? 'mainnet-control-plane'
          : network === 'public'
            ? 'mainnet-payments-offchain-storage'
            : 'testnet',
      notes:
        'Stellar is the control plane (auth, quota/lease hashes). Object bytes stay off-chain (Vercel Blob). Full Mainnet production requires a Public-network storage-market contract + funded treasury.',
    },
    docs: {
      cloud: 'https://evernet.tech/docs#cloud',
      networks: 'https://evernet.tech/docs#networks',
      openapi: '/openapi.json',
    },
  })
})

app.post('/auth/challenge', (req, res) => {
  const address = String(req.body?.address || '')
  if (!isStellarAddress(address)) {
    res.status(400).json({ error: 'Valid Stellar address required' })
    return
  }
  res.json(buildChallenge(address))
})

app.post('/auth/verify', (req, res) => {
  try {
    const address = String(req.body?.address || '')
    const token = verifyChallengeAndIssueToken({
      address,
      signedTransaction: String(req.body?.signedTransaction || ''),
    })
    res.json({ token, address })
  } catch (err) {
    res.status(401).json({ error: err instanceof Error ? err.message : 'Auth failed' })
  }
})

app.get('/profile', requireWallet, async (req: AuthedRequest, res) => {
  try {
    res.json(await getMergedProfile(req.wallet!))
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Profile error' })
  }
})

app.get('/usage', requireWallet, async (req: AuthedRequest, res) => {
  try {
    const profile = await getMergedProfile(req.wallet!)
    const project = req.projectId ? await getProject(req.projectId) : null
    res.json({
      profile,
      auth: {
        type: req.authType || 'jwt',
        keyId: req.apiKeyId,
        keyName: req.apiKeyName,
        projectId: req.projectId,
      },
      project: project
        ? {
            id: project.id,
            name: project.name,
            maxBytes: project.maxBytes,
            usedBytes: project.usedBytes,
            remainingBytes:
              project.maxBytes == null ? null : Math.max(0, project.maxBytes - project.usedBytes),
          }
        : null,
      limits: { requestsPerMinute: REQUESTS_PER_MINUTE },
    })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Usage error' })
  }
})

function requireWalletSession(req: AuthedRequest, res: Response): boolean {
  if (req.authType === 'api_key') {
    res.status(403).json({ error: 'This action requires a wallet session, not an API key' })
    return false
  }
  return true
}

app.get('/keys', requireWallet, async (req: AuthedRequest, res) => {
  try {
    if (!requireWalletSession(req, res)) return
    res.json({ keys: await listApiKeys(req.wallet!) })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'List keys failed' })
  }
})

app.post('/keys', requireWallet, async (req: AuthedRequest, res) => {
  try {
    if (!requireWalletSession(req, res)) return
    const projectId = req.body?.projectId ? String(req.body.projectId) : undefined
    if (projectId) {
      const project = await getProject(projectId)
      if (!project || project.owner !== req.wallet! || project.archivedAt) {
        res.status(400).json({ error: 'Invalid projectId for this wallet' })
        return
      }
    }
    const created = await createApiKey(req.wallet!, String(req.body?.name || 'default'), projectId)
    res.status(201).json(created)
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Create key failed' })
  }
})

app.delete('/keys/:id', requireWallet, async (req: AuthedRequest, res) => {
  try {
    if (!requireWalletSession(req, res)) return
    const ok = await revokeApiKey(req.wallet!, String(req.params.id))
    if (!ok) {
      res.status(404).json({ error: 'Key not found' })
      return
    }
    res.json({ ok: true })
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Revoke key failed' })
  }
})

app.get('/projects', requireWallet, async (req: AuthedRequest, res) => {
  try {
    if (!requireWalletSession(req, res)) return
    res.json({ projects: await listProjects(req.wallet!) })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'List projects failed' })
  }
})

app.post('/projects', requireWallet, async (req: AuthedRequest, res) => {
  try {
    if (!requireWalletSession(req, res)) return
    const maxBytes =
      req.body?.maxBytes === undefined || req.body?.maxBytes === null
        ? null
        : Number(req.body.maxBytes)
    const project = await createProject(req.wallet!, {
      name: String(req.body?.name || 'project'),
      maxBytes,
    })
    res.status(201).json(project)
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Create project failed' })
  }
})

app.patch('/projects/:id', requireWallet, async (req: AuthedRequest, res) => {
  try {
    if (!requireWalletSession(req, res)) return
    const patch: { name?: string; maxBytes?: number | null } = {}
    if (req.body?.name !== undefined) patch.name = String(req.body.name)
    if (req.body?.maxBytes !== undefined) {
      patch.maxBytes = req.body.maxBytes === null ? null : Number(req.body.maxBytes)
    }
    const project = await updateProject(req.wallet!, String(req.params.id), patch)
    if (!project) {
      res.status(404).json({ error: 'Project not found' })
      return
    }
    res.json(project)
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Update project failed' })
  }
})

app.delete('/projects/:id', requireWallet, async (req: AuthedRequest, res) => {
  try {
    if (!requireWalletSession(req, res)) return
    const ok = await archiveProject(req.wallet!, String(req.params.id))
    if (!ok) {
      res.status(404).json({ error: 'Project not found' })
      return
    }
    res.json({ ok: true })
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Archive project failed' })
  }
})

app.get('/objects', requireWallet, async (req: AuthedRequest, res) => {
  try {
    const trashQ = String(req.query.trash || '')
    const trash: boolean | 'only' =
      trashQ === '1' || trashQ === 'true' ? true : trashQ === 'only' ? 'only' : false
    const [objects, folders] = await Promise.all([
      listObjects(req.wallet!, { trash }),
      listFolders(req.wallet!),
    ])
    res.json({
      objects: publicObjects(objects),
      folders,
      trash,
      trashTtlMs: TRASH_TTL_MS,
    })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'List failed' })
  }
})

app.get('/folders', requireWallet, async (req: AuthedRequest, res) => {
  try {
    res.json({ folders: await listFolders(req.wallet!) })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'List folders failed' })
  }
})

app.post('/folders', requireWallet, async (req: AuthedRequest, res) => {
  try {
    const path = normalizeFolderPath(req.body?.path)
    if (!path) {
      res.status(400).json({ error: 'Folder path required' })
      return
    }
    const folders = await createFolder(req.wallet!, path)
    res.status(201).json({ path, folders })
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Create folder failed' })
  }
})

app.patch('/folders', requireWallet, async (req: AuthedRequest, res) => {
  try {
    const result = await renameFolder(
      req.wallet!,
      String(req.body?.from || ''),
      String(req.body?.to || ''),
    )
    res.json(result)
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Rename folder failed' })
  }
})

app.delete('/folders', requireWallet, async (req: AuthedRequest, res) => {
  try {
    const path = String(req.query.path || req.body?.path || '')
    const recursive =
      String(req.query.recursive || req.body?.recursive || 'false').toLowerCase() === 'true'
    const result = await deleteFolder(req.wallet!, path, recursive)
    // Soft-delete: no on-chain cleanup until permanent purge
    res.json({ ok: true, trashTtlMs: TRASH_TTL_MS, ...result })
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Delete folder failed' })
  }
})

app.get('/objects/:hash', requireWallet, async (req: AuthedRequest, res) => {
  try {
    const meta = await getObject(req.wallet!, String(req.params.hash))
    if (!meta) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    const blob = await readBlob(meta)
    if (!blob) {
      res.status(404).json({ error: 'Blob missing' })
      return
    }
    res.setHeader('Content-Type', 'application/octet-stream')
    res.setHeader('X-Object-Name', encodeURIComponent(meta.name))
    res.setHeader('X-Object-Mime', meta.mimeType)
    res.setHeader('Access-Control-Expose-Headers', 'X-Object-Name, X-Object-Mime')
    res.send(blob)
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Download failed' })
  }
})

app.post('/objects', requireWallet, upload.single('file'), async (req: AuthedRequest, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'file required' })
      return
    }
    const owner = req.wallet!
    const result = await ingestObject({
      owner,
      data: req.file.buffer,
      name: String(req.body?.name || req.file.originalname || 'file.bin'),
      folder: normalizeFolderPath(req.body?.folder),
      mimeType: String(req.body?.mimeType || req.file.mimetype || 'application/octet-stream'),
      encrypted: String(req.body?.encrypted || 'true') === 'true',
      projectId: req.projectId,
    })
    res.status(201).json({
      object: publicObject(result.object),
      profile: result.profile,
      folders: await listFolders(owner),
    })
  } catch (err) {
    const e = err as Error & { status?: number; hash?: string; remaining?: number; need?: number }
    res.status(e.status || 400).json({
      error: e.message || 'Upload failed',
      hash: e.hash,
      remaining: e.remaining,
      need: e.need,
    })
  }
})

app.patch('/objects/:hash', requireWallet, async (req: AuthedRequest, res) => {
  try {
    const hash = String(req.params.hash)
    const patch: Partial<StoredObjectMeta> = {}
    if (req.body?.name !== undefined) patch.name = String(req.body.name)
    if (req.body?.folder !== undefined) patch.folder = normalizeFolderPath(req.body.folder)
    if (!Object.keys(patch).length) {
      res.status(400).json({ error: 'Nothing to update' })
      return
    }
    const object = await patchObjectMeta(req.wallet!, hash, patch)
    if (!object) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    res.json({ object: publicObject(object), folders: await listFolders(req.wallet!) })
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Update failed' })
  }
})

app.delete('/objects/:hash', requireWallet, async (req: AuthedRequest, res) => {
  try {
    const hash = String(req.params.hash)
    const permanent =
      String(req.query.permanent || '').toLowerCase() === 'true' ||
      String(req.query.permanent || '') === '1'
    const existing =
      (await getObject(req.wallet!, hash)) ||
      (await getObject(req.wallet!, hash, { includeTrash: true }))
    if (!existing) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    if (permanent || existing.deletedAt) {
      const profile = await deleteObjectLocal(req.wallet!, hash)
      if (existing.projectId && !existing.deletedAt) {
        await debitProjectUpload(existing.projectId, existing.size).catch(() => undefined)
      }
      await deleteObjectOnChain({ owner: req.wallet!, hashHex: hash }).catch(() => undefined)
      res.json({
        ok: true,
        permanent: true,
        profile,
        folders: await listFolders(req.wallet!),
      })
      return
    }
    const profile = await trashObject(req.wallet!, hash)
    if (existing.projectId) {
      await debitProjectUpload(existing.projectId, existing.size).catch(() => undefined)
    }
    res.json({
      ok: true,
      trashed: true,
      trashTtlMs: TRASH_TTL_MS,
      profile,
      folders: await listFolders(req.wallet!),
    })
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Delete failed' })
  }
})

app.post('/objects/:hash/restore', requireWallet, async (req: AuthedRequest, res) => {
  try {
    const hash = String(req.params.hash)
    const object = await restoreObject(req.wallet!, hash)
    res.json({
      ok: true,
      object: publicObject(object),
      folders: await listFolders(req.wallet!),
      profile: await getMergedProfile(req.wallet!),
    })
  } catch (err) {
    const e = err as Error & { status?: number }
    res.status(e.status || 400).json({ error: e.message || 'Restore failed' })
  }
})

app.post('/trash/purge', requireWallet, async (req: AuthedRequest, res) => {
  try {
    const purged = await purgeExpiredTrash(req.wallet!)
    await Promise.all(
      purged.map((hash) =>
        deleteObjectOnChain({ owner: req.wallet!, hashHex: hash }).catch(() => undefined),
      ),
    )
    res.json({ ok: true, purged: purged.length, hashes: purged })
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Purge failed' })
  }
})

app.post('/purchases/confirm', requireWallet, async (req: AuthedRequest, res) => {
  try {
    const planId = String(req.body?.planId || '')
    const txHash = String(req.body?.txHash || '')
    const verified = await verifyStoragePayment({ txHash, from: req.wallet!, planId })
    if (!verified.ok) {
      res.status(400).json({ error: verified.error })
      return
    }
    const profile = await creditPurchaseOnChain({
      address: req.wallet!,
      planId,
      paymentHashHex: verified.paymentHashHex,
    })
    res.json({
      ok: true,
      profile,
      amount: verified.amount,
      txHash,
      explorerUrl:
        config.network === 'public'
          ? `https://stellar.expert/explorer/public/tx/${txHash}`
          : `https://stellar.expert/explorer/testnet/tx/${txHash}`,
    })
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Purchase confirm failed' })
  }
})

app.get('/config/public', (_req, res) => {
  res.json({
    network: config.network,
    networkPassphrase: config.networkPassphrase,
    treasury: config.treasuryPublic,
    contractId: config.contractId || null,
    onChain: onChainEnabled(),
    plans: Object.entries(config.planBytes).map(([id, bytes]) => ({
      id,
      bytes,
      priceXlm: config.planPricesXlm[id],
    })),
    baseQuotaBytes: config.baseQuotaBytes,
  })
})

export default app
