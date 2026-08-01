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
import {
  deleteObjectLocal,
  getObject,
  listObjects,
  readBlob,
  registerObjectLocal,
  patchObjectMeta,
  sha256Hex,
  writeBlob,
  type StoredObjectMeta,
} from './store.js'

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
  next()
})
app.use(cors({ origin: allowedOrigin }))
app.use(express.json({ limit: '2mb' }))

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
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

app.get('/objects', requireWallet, async (req: AuthedRequest, res) => {
  try {
    res.json({ objects: await listObjects(req.wallet!) })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'List failed' })
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

    res.status(201).json({ object, profile: updated })
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Upload failed' })
  }
})

app.delete('/objects/:hash', requireWallet, async (req: AuthedRequest, res) => {
  try {
    const hash = String(req.params.hash)
    const profile = await deleteObjectLocal(req.wallet!, hash)
    await deleteObjectOnChain({ owner: req.wallet!, hashHex: hash })
    res.json({ ok: true, profile })
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
