import 'dotenv/config'
import cors from 'cors'
import express from 'express'
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
  registerObjectOnChain,
} from './soroban.js'
import { normalizeFolderPath } from './paths.js'
import { createApiKey, listApiKeys, revokeApiKey } from './apikeys.js'
import { openApiSpec } from './openapi.js'
import { publicObject, publicObjects } from './publicMeta.js'
import { REQUESTS_PER_MINUTE, rateLimit } from './ratelimit.js'
import {
  createFolder,
  deleteFolder,
  deleteObjectLocal,
  getObject,
  listFolders,
  listObjects,
  readBlob,
  registerObjectLocal,
  patchObjectMeta,
  renameFolder,
  sha256Hex,
  writeBlob,
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
app.use(express.json({ limit: '2mb' }))
app.use(rateLimit)

app.get('/', (_req, res) => {
  res.json({
    name: 'Evernet Storage API',
    version: API_VERSION,
    docs: 'https://evernet.tech/docs#api',
    openapi: '/openapi.json',
    health: '/health',
    config: '/config/public',
  })
})

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
    res.json({
      profile,
      auth: {
        type: req.authType || 'jwt',
        keyId: req.apiKeyId,
        keyName: req.apiKeyName,
      },
      limits: { requestsPerMinute: REQUESTS_PER_MINUTE },
    })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Usage error' })
  }
})

app.get('/keys', requireWallet, async (req: AuthedRequest, res) => {
  try {
    if (req.authType === 'api_key') {
      res.status(403).json({ error: 'Manage API keys with a wallet session, not an API key' })
      return
    }
    res.json({ keys: await listApiKeys(req.wallet!) })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'List keys failed' })
  }
})

app.post('/keys', requireWallet, async (req: AuthedRequest, res) => {
  try {
    if (req.authType === 'api_key') {
      res.status(403).json({ error: 'Create API keys with a wallet session, not an API key' })
      return
    }
    const created = await createApiKey(req.wallet!, String(req.body?.name || 'default'))
    res.status(201).json(created)
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Create key failed' })
  }
})

app.delete('/keys/:id', requireWallet, async (req: AuthedRequest, res) => {
  try {
    if (req.authType === 'api_key') {
      res.status(403).json({ error: 'Revoke API keys with a wallet session, not an API key' })
      return
    }
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

app.get('/objects', requireWallet, async (req: AuthedRequest, res) => {
  try {
    const [objects, folders] = await Promise.all([
      listObjects(req.wallet!),
      listFolders(req.wallet!),
    ])
    res.json({ objects: publicObjects(objects), folders })
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
    // Best-effort on-chain cleanup for recursively deleted objects
    await Promise.all(
      result.deletedHashes.map((hash) =>
        deleteObjectOnChain({ owner: req.wallet!, hashHex: hash }).catch(() => undefined),
      ),
    )
    res.json({ ok: true, ...result })
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
    const name = String(req.body?.name || req.file.originalname || 'file.bin')
    const folder = normalizeFolderPath(req.body?.folder)
    const mimeType = String(req.body?.mimeType || req.file.mimetype || 'application/octet-stream')
    const encrypted = String(req.body?.encrypted || 'true') === 'true'
    const buf = req.file.buffer
    const hash = sha256Hex(buf)

    if (await getObject(owner, hash)) {
      res.status(409).json({ error: 'You already stored this exact file', hash })
      return
    }

    const profile = await getMergedProfile(owner)
    if (profile.usedBytes + buf.length > profile.quotaBytes) {
      res.status(402).json({
        error: 'Insufficient quota',
        remaining: Math.max(0, profile.quotaBytes - profile.usedBytes),
        need: buf.length,
      })
      return
    }

    const blobRef = await writeBlob(owner, buf)
    const meta: StoredObjectMeta = {
      hash,
      owner,
      name,
      folder,
      mimeType,
      size: buf.length,
      encrypted,
      createdAt: Date.now(),
      shards: Math.max(4, Math.min(32, Math.ceil(buf.length / (256 * 1024)) * 4)),
      blobRef,
    }
    const updated = await registerObjectLocal(meta)
    const registrationTx = await registerObjectOnChain({ owner, hashHex: hash, size: buf.length })
    const object = registrationTx
      ? ((await patchObjectMeta(owner, hash, { registrationTx })) ?? { ...meta, registrationTx })
      : meta

    res.status(201).json({
      object: publicObject(object),
      profile: updated,
      folders: await listFolders(owner),
    })
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Upload failed' })
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
    const profile = await deleteObjectLocal(req.wallet!, hash)
    await deleteObjectOnChain({ owner: req.wallet!, hashHex: hash })
    res.json({ ok: true, profile, folders: await listFolders(req.wallet!) })
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Delete failed' })
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
