import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import type { Request, Response, NextFunction } from 'express'
import { Keypair } from '@stellar/stellar-sdk'
import { config } from './config.js'
import { consumeChallenge, createChallenge } from './store.js'

export type AuthedRequest = Request & { wallet?: string }

function b64url(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input) : input
  return buf.toString('base64url')
}

export function signToken(address: string, ttlMs = 24 * 60 * 60 * 1000): string {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = b64url(
    JSON.stringify({ sub: address, exp: Date.now() + ttlMs, iat: Date.now() }),
  )
  const data = `${header}.${payload}`
  const sig = createHmac('sha256', config.jwtSecret).update(data).digest('base64url')
  return `${data}.${sig}`
}

export function verifyToken(token: string): string | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [header, payload, sig] = parts
  const data = `${header}.${payload}`
  const expected = createHmac('sha256', config.jwtSecret).update(data).digest('base64url')
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const body = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      sub: string
      exp: number
    }
    if (!body.sub || Date.now() > body.exp) return null
    return body.sub
  } catch {
    return null
  }
}

export function requireWallet(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing bearer token' })
    return
  }
  const address = verifyToken(header.slice(7))
  if (!address) {
    res.status(401).json({ error: 'Invalid or expired token' })
    return
  }
  req.wallet = address
  next()
}

function tryVerify(address: string, messageBytes: Buffer, signatureBase64: string): boolean {
  try {
    const kp = Keypair.fromPublicKey(address)
    const sig = Buffer.from(signatureBase64, 'base64')
    if (kp.verify(messageBytes, sig)) return true
    // Some wallets sign the sha256 digest
    const digest = createHash('sha256').update(messageBytes).digest()
    if (kp.verify(digest, sig)) return true
    return false
  } catch {
    return false
  }
}

/** Freighter signMessage returns base64 signature of the message bytes. */
export function verifyFreighterMessage(
  address: string,
  message: string,
  signatureBase64: string,
): boolean {
  const raw = Buffer.from(message, 'utf8')
  if (tryVerify(address, raw, signatureBase64)) return true
  // SEP-53 style prefix used by some Stellar message signers
  const sep53 = Buffer.from(`Stellar Signed Message:\n${message}`, 'utf8')
  if (tryVerify(address, sep53, signatureBase64)) return true
  return false
}

export function issueChallenge(address: string) {
  return createChallenge(address)
}

export function verifyChallengeAndIssueToken(input: {
  address: string
  challengeId: string
  message: string
  signature: string
}): string {
  if (!consumeChallenge(input.challengeId, input.address)) {
    throw new Error('Challenge invalid or expired')
  }
  if (!input.message.includes(input.challengeId) || !input.message.includes(input.address)) {
    throw new Error('Message does not match challenge')
  }
  if (!verifyFreighterMessage(input.address, input.message, input.signature)) {
    throw new Error('Invalid wallet signature')
  }
  return signToken(input.address)
}
