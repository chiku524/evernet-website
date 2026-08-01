import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import multer from 'multer'
import { issueChallenge, requireWallet, verifyChallengeAndIssueToken, type AuthedRequest } from './auth.js'
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
} from './store.js'

const app = express()
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 80 * 1024 * 1024 },
})

app.use(cors({ origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(',') }))
app.use(express.json({ limit: '2mb' }))

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    network: config.network,
    onChain: onChainEnabled(),
    contractId: config.contractId || null,
    treasury: config.treasuryPublic,
  })
})

app.post('/auth/challenge', (req, res) => {
  const address = String(req.body?.address || '')
  if (!address.startsWith('G') || address.length !== 56) {
    res.status(400).json({ error: 'Valid Stellar address required' })
    return
  }
  const challenge = issueChallenge(address)
  res.json(challenge)
})

app.post('/auth/verify', (req, res) => {
  try {
    const token = verifyChallengeAndIssueToken({
      address: String(req.body?.address || ''),
      challengeId: String(req.body?.challengeId || ''),
      message: String(req.body?.message || ''),
      signature: String(req.body?.signature || ''),
    })
    res.json({ token, address: req.body.address })
  } catch (err) {
    res.status(401).json({ error: err instanceof Error ? err.message : 'Auth failed' })
  }
})

app.get('/profile', requireWallet, async (req: AuthedRequest, res) => {
  try {
    const profile = await getMergedProfile(req.wallet!)
    res.json(profile)
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Profile error' })
  }
})

app.get('/objects', requireWallet, (req: AuthedRequest, res) => {
  res.json({ objects: listObjects(req.wallet!) })
})

app.get('/objects/:hash', requireWallet, (req: AuthedRequest, res) => {
  const hash = String(req.params.hash)
  const meta = getObject(hash)
  if (!meta || meta.owner !== req.wallet) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  const blob = readBlob(meta.hash)
  if (!blob) {
    res.status(404).json({ error: 'Blob missing' })
    return
  }
  res.setHeader('Content-Type', 'application/octet-stream')
  res.setHeader('X-Object-Name', encodeURIComponent(meta.name))
  res.setHeader('X-Object-Mime', meta.mimeType)
  res.send(blob)
})

app.post('/objects', requireWallet, upload.single('file'), async (req: AuthedRequest, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'file required' })
      return
    }
    const name = String(req.body?.name || req.file.originalname || 'file.bin')
    const mimeType = String(req.body?.mimeType || req.file.mimetype || 'application/octet-stream')
    const encrypted = String(req.body?.encrypted || 'true') === 'true'
    const buf = req.file.buffer
    const hash = sha256Hex(buf)

    const existing = getObject(hash)
    if (existing) {
      res.status(409).json({ error: 'Object already exists', hash })
      return
    }

    const profile = await getMergedProfile(req.wallet!)
    if (profile.usedBytes + buf.length > profile.quotaBytes) {
      res.status(402).json({
        error: 'Insufficient quota',
        remaining: Math.max(0, profile.quotaBytes - profile.usedBytes),
        need: buf.length,
      })
      return
    }

    writeBlob(hash, buf)
    const meta: import('./store.js').StoredObjectMeta = {
      hash,
      owner: req.wallet!,
      name,
      mimeType,
      size: buf.length,
      encrypted,
      createdAt: Date.now(),
      shards: Math.max(4, Math.min(32, Math.ceil(buf.length / (256 * 1024)) * 4)),
    }
    const updated = registerObjectLocal(meta)
    const registrationTx = await registerObjectOnChain({
      owner: req.wallet!,
      hashHex: hash,
      size: buf.length,
    })
    const object = registrationTx
      ? (patchObjectMeta(hash, { registrationTx }) ?? { ...meta, registrationTx })
      : meta

    res.status(201).json({ object, profile: updated })
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Upload failed' })
  }
})

app.delete('/objects/:hash', requireWallet, async (req: AuthedRequest, res) => {
  try {
    const hash = String(req.params.hash)
    const profile = deleteObjectLocal(req.wallet!, hash)
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
    const verified = await verifyStoragePayment({
      txHash,
      from: req.wallet!,
      planId,
    })
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
