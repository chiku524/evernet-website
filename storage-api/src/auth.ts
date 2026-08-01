import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { Request, Response, NextFunction } from 'express'
import {
  Account,
  Keypair,
  Operation,
  StrKey,
  Transaction,
  TransactionBuilder,
} from '@stellar/stellar-sdk'
import { looksLikeApiKey, resolveApiKey } from './apikeys.js'
import { config } from './config.js'
import { rateLimitAuthed } from './ratelimit.js'

export type AuthedRequest = Request & {
  wallet?: string
  authType?: 'jwt' | 'api_key'
  apiKeyId?: string
  apiKeyName?: string
  projectId?: string
}

const CHALLENGE_TTL_SECONDS = 300
const HOME_DOMAIN = 'evernet.tech'
const DATA_NAME = `${HOME_DOMAIN} auth`

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

/**
 * Accepts a wallet JWT or an API key (`evn_live_…`). Both authorize as the
 * owning Stellar address. API keys are for server agents; JWTs for interactive
 * wallet sessions.
 */
export function requireWallet(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  const apiKeyHeader = req.headers['x-evernet-api-key']
  const bearer = header?.startsWith('Bearer ') ? header.slice(7).trim() : ''
  const rawKey =
    (typeof apiKeyHeader === 'string' ? apiKeyHeader.trim() : '') ||
    (bearer && looksLikeApiKey(bearer) ? bearer : '')

  if (rawKey) {
    void resolveApiKey(rawKey)
      .then((resolved) => {
        if (!resolved) {
          res.status(401).json({ error: 'Invalid or revoked API key' })
          return
        }
        req.wallet = resolved.owner
        req.authType = 'api_key'
        req.apiKeyId = resolved.keyId
        req.apiKeyName = resolved.keyName
        req.projectId = resolved.projectId
        if (!rateLimitAuthed(req, res)) return
        next()
      })
      .catch((err) => {
        res.status(500).json({ error: err instanceof Error ? err.message : 'Auth error' })
      })
    return
  }

  if (!bearer) {
    res.status(401).json({ error: 'Missing bearer token' })
    return
  }
  const address = verifyToken(bearer)
  if (!address) {
    res.status(401).json({ error: 'Invalid or expired token' })
    return
  }
  req.wallet = address
  req.authType = 'jwt'
  if (!rateLimitAuthed(req, res)) return
  next()
}

/**
 * Dedicated server keypair for challenge transactions, derived from the API
 * secret so it works without provisioning another Stellar account. The account
 * is never funded: SEP-10 challenges use sequence number 0 and are never
 * submitted to the network.
 */
function serverKeypair(): Keypair {
  const seed = createHash('sha256').update(`${config.jwtSecret}:sep10`).digest()
  return Keypair.fromRawEd25519Seed(seed)
}

export function isStellarAddress(address: string): boolean {
  return StrKey.isValidEd25519PublicKey(address)
}

/**
 * SEP-10 style challenge. Every Stellar wallet can sign a transaction, while
 * only a subset implement arbitrary message signing, so the challenge is a
 * throwaway sequence-0 transaction rather than a plain string.
 */
export function buildChallenge(address: string): { transaction: string; network: string } {
  if (!isStellarAddress(address)) throw new Error('Valid Stellar address required')

  const server = serverKeypair()
  const nonce = randomBytes(48).toString('base64')
  const now = Math.floor(Date.now() / 1000)

  const tx = new TransactionBuilder(new Account(server.publicKey(), '-1'), {
    fee: '100',
    networkPassphrase: config.networkPassphrase,
    timebounds: { minTime: now, maxTime: now + CHALLENGE_TTL_SECONDS },
  })
    .addOperation(
      Operation.manageData({ name: DATA_NAME, value: nonce, source: address }),
    )
    .build()

  tx.sign(server)
  return { transaction: tx.toXDR(), network: config.networkPassphrase }
}

export function verifyChallengeAndIssueToken(input: {
  address: string
  signedTransaction: string
}): string {
  if (!isStellarAddress(input.address)) throw new Error('Valid Stellar address required')
  if (!input.signedTransaction) throw new Error('Signed challenge required')

  let tx: Transaction
  try {
    tx = new Transaction(input.signedTransaction, config.networkPassphrase)
  } catch {
    throw new Error('Challenge is not a valid transaction for this network')
  }

  if (tx.sequence !== '0') throw new Error('Challenge must use sequence 0')

  const server = serverKeypair()
  if (tx.source !== server.publicKey()) throw new Error('Challenge was not issued by this server')

  const bounds = tx.timeBounds
  const now = Math.floor(Date.now() / 1000)
  if (!bounds) throw new Error('Challenge is missing timebounds')
  if (now < Number(bounds.minTime) - 30 || now > Number(bounds.maxTime)) {
    throw new Error('Challenge expired, please retry')
  }

  const [op] = tx.operations
  if (!op || op.type !== 'manageData' || op.name !== DATA_NAME) {
    throw new Error('Unexpected challenge payload')
  }
  if (op.source !== input.address) throw new Error('Challenge was issued for a different wallet')

  const hash = tx.hash()
  const signedBy = (kp: Keypair) =>
    tx.signatures.some((sig) => {
      try {
        return kp.verify(hash, sig.signature())
      } catch {
        return false
      }
    })

  if (!signedBy(server)) throw new Error('Server signature missing or altered')
  if (!signedBy(Keypair.fromPublicKey(input.address))) throw new Error('Invalid wallet signature')

  return signToken(input.address)
}
