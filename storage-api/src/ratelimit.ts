import type { NextFunction, Request, Response } from 'express'

type AuthedLike = Request & {
  wallet?: string
  authType?: string
  apiKeyId?: string
}

type Bucket = { count: number; resetAt: number }

/** Best-effort in-memory limiter (per serverless isolate). */
const buckets = new Map<string, Bucket>()

const WINDOW_MS = 60_000
const DEFAULT_LIMIT = 120
const AUTH_BURST = 30

function take(key: string, limit: number): { ok: boolean; remaining: number; resetAt: number } {
  const now = Date.now()
  let bucket = buckets.get(key)
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + WINDOW_MS }
    buckets.set(key, bucket)
  }
  bucket.count += 1
  const remaining = Math.max(0, limit - bucket.count)
  return { ok: bucket.count <= limit, remaining, resetAt: bucket.resetAt }
}

function clientKey(req: Request): string {
  const authed = req as AuthedLike
  if (authed.wallet) {
    return `wallet:${authed.wallet}:${authed.authType || 'jwt'}:${authed.apiKeyId || ''}`
  }
  const xf = req.headers['x-forwarded-for']
  const ip = (typeof xf === 'string' ? xf.split(',')[0] : req.socket.remoteAddress) || 'unknown'
  return `ip:${ip.trim()}`
}

export const REQUESTS_PER_MINUTE = DEFAULT_LIMIT

function setLimitHeaders(res: Response, limit: number, remaining: number, resetAt: number) {
  res.setHeader('X-RateLimit-Limit', String(limit))
  res.setHeader('X-RateLimit-Remaining', String(remaining))
  res.setHeader('X-RateLimit-Reset', String(Math.ceil(resetAt / 1000)))
}

/** Early IP / path limiter (runs before auth). */
export function rateLimit(req: Request, res: Response, next: NextFunction) {
  const path = req.path
  const limit =
    path.startsWith('/auth/')
      ? AUTH_BURST
      : path === '/health' || path === '/openapi.json' || path === '/' || path === '/config/public'
        ? 300
        : DEFAULT_LIMIT
  // Authed routes get a second, wallet-scoped check inside requireWallet.
  if (req.headers.authorization || req.headers['x-evernet-api-key']) {
    next()
    return
  }
  const { ok, remaining, resetAt } = take(clientKey(req), limit)
  setLimitHeaders(res, limit, remaining, resetAt)
  if (!ok) {
    res.status(429).json({ error: 'Rate limit exceeded. Try again shortly.' })
    return
  }
  next()
}

/** Per-wallet / per-key limiter after identity is resolved. */
export function rateLimitAuthed(req: AuthedLike, res: Response): boolean {
  const { ok, remaining, resetAt } = take(clientKey(req), DEFAULT_LIMIT)
  setLimitHeaders(res, DEFAULT_LIMIT, remaining, resetAt)
  if (!ok) {
    res.status(429).json({ error: 'Rate limit exceeded. Try again shortly.' })
    return false
  }
  return true
}
