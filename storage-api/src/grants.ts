import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { StrKey } from '@stellar/stellar-sdk'
import { driver, pathId } from './blobstore.js'
import { objectKey } from './objectKey.js'
import type { StoredObjectMeta } from './store.js'

function isStellarAddress(address: string): boolean {
  return StrKey.isValidEd25519PublicKey(address)
}

export type ShareGrant = {
  id: string
  owner: string
  hash: string
  key: string
  permission: 'read'
  /** If set, only this wallet may redeem the share (with Bearer). Null = anyone with token. */
  grantee: string | null
  tokenHash: string
  createdAt: number
  expiresAt: number
  revokedAt?: number
  lastUsedAt?: number
}

export type PublicGrant = {
  id: string
  hash: string
  key: string
  permission: 'read'
  grantee: string | null
  createdAt: number
  expiresAt: number
  revokedAt?: number
  lastUsedAt?: number
}

type OwnerIndex = { owner: string; ids: string[] }

const TOKEN_PREFIX = 'evn_share_'

function grantPath(id: string): string {
  return `v1/grants/items/${id}.json`
}

function ownerIndexPath(owner: string): string {
  return `v1/grants/by-owner/${pathId(owner)}.json`
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function toPublic(g: ShareGrant): PublicGrant {
  return {
    id: g.id,
    hash: g.hash,
    key: g.key,
    permission: g.permission,
    grantee: g.grantee,
    createdAt: g.createdAt,
    expiresAt: g.expiresAt,
    revokedAt: g.revokedAt,
    lastUsedAt: g.lastUsedAt,
  }
}

async function readIndex(owner: string): Promise<OwnerIndex> {
  return (await driver.getJson<OwnerIndex>(ownerIndexPath(owner))) ?? { owner, ids: [] }
}

export async function createShareGrant(input: {
  owner: string
  meta: StoredObjectMeta
  expiresInSec?: number
  grantee?: string | null
}): Promise<PublicGrant & { token: string; urlPath: string }> {
  const ttl = Math.min(Math.max(Number(input.expiresInSec) || 7 * 24 * 3600, 60), 90 * 24 * 3600)
  let grantee: string | null = null
  if (input.grantee && input.grantee !== '*') {
    if (!isStellarAddress(input.grantee)) throw new Error('grantee must be a Stellar G-address or *')
    grantee = input.grantee
  }
  const id = randomBytes(8).toString('hex')
  const secret = randomBytes(24).toString('hex')
  const token = `${TOKEN_PREFIX}${id}_${secret}`
  const now = Date.now()
  const grant: ShareGrant = {
    id,
    owner: input.owner,
    hash: input.meta.hash,
    key: objectKey(input.meta),
    permission: 'read',
    grantee,
    tokenHash: hashToken(token),
    createdAt: now,
    expiresAt: now + ttl * 1000,
  }
  await driver.putJson(grantPath(id), grant)
  const index = await readIndex(input.owner)
  if (!index.ids.includes(id)) {
    index.ids.push(id)
    await driver.putJson(ownerIndexPath(input.owner), index)
  }
  return { ...toPublic(grant), token, urlPath: `/s3/v1/shared/${token}` }
}

export async function listShareGrants(owner: string): Promise<PublicGrant[]> {
  const index = await readIndex(owner)
  const rows = await Promise.all(index.ids.map((id) => driver.getJson<ShareGrant>(grantPath(id))))
  return rows
    .filter((g): g is ShareGrant => Boolean(g) && !g!.revokedAt)
    .map(toPublic)
    .sort((a, b) => b.createdAt - a.createdAt)
}

export async function revokeShareGrant(owner: string, id: string): Promise<boolean> {
  const grant = await driver.getJson<ShareGrant>(grantPath(id))
  if (!grant || grant.owner !== owner) return false
  if (grant.revokedAt) return true
  grant.revokedAt = Date.now()
  await driver.putJson(grantPath(id), grant)
  return true
}

export async function resolveShareToken(
  token: string,
  callerWallet?: string | null,
): Promise<{ grant: ShareGrant } | null> {
  if (!token.startsWith(TOKEN_PREFIX)) return null
  const rest = token.slice(TOKEN_PREFIX.length)
  const underscore = rest.indexOf('_')
  if (underscore < 1) return null
  const id = rest.slice(0, underscore)
  const grant = await driver.getJson<ShareGrant>(grantPath(id))
  if (!grant || grant.revokedAt) return null
  if (Date.now() > grant.expiresAt) return null
  const a = Buffer.from(grant.tokenHash)
  const b = Buffer.from(hashToken(token))
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  if (grant.grantee) {
    if (!callerWallet || callerWallet !== grant.grantee) return null
  }
  grant.lastUsedAt = Date.now()
  await driver.putJson(grantPath(id), grant).catch(() => undefined)
  return { grant }
}
