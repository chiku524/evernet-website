import { createHmac, timingSafeEqual } from 'node:crypto'
import { config } from './config.js'

export type PresignPayload = {
  sub: string
  hash: string
  op: 'get'
  exp: number
}

function b64url(buf: Buffer | string): string {
  const b = typeof buf === 'string' ? Buffer.from(buf) : buf
  return b.toString('base64url')
}

function sign(data: string): string {
  return createHmac('sha256', `${config.jwtSecret}:presign`).update(data).digest('base64url')
}

export function createPresignToken(input: {
  owner: string
  hash: string
  expiresInSec?: number
}): { token: string; expiresAt: number } {
  const ttl = Math.min(Math.max(Number(input.expiresInSec) || 3600, 60), 24 * 60 * 60)
  const exp = Math.floor(Date.now() / 1000) + ttl
  const payload: PresignPayload = { sub: input.owner, hash: input.hash, op: 'get', exp }
  const body = b64url(JSON.stringify(payload))
  const token = `${body}.${sign(body)}`
  return { token, expiresAt: exp }
}

export function verifyPresignToken(token: string): PresignPayload | null {
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [body, sig] = parts
  const expected = sign(body)
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as PresignPayload
    if (payload.op !== 'get' || !payload.sub || !payload.hash) return null
    if (Math.floor(Date.now() / 1000) > payload.exp) return null
    return payload
  } catch {
    return null
  }
}
