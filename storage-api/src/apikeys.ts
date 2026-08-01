import { createHash, randomBytes } from 'node:crypto'
import { driver, pathId } from './blobstore.js'

export type ApiKeyRecord = {
  id: string
  owner: string
  name: string
  /** Optional project pool this key draws from. */
  projectId?: string
  /** SHA-256 hex of the full secret key. */
  keyHash: string
  prefix: string
  createdAt: number
  lastUsedAt?: number
  revokedAt?: number
}

export type PublicApiKey = {
  id: string
  name: string
  prefix: string
  projectId?: string
  createdAt: number
  lastUsedAt?: number
  revokedAt?: number
}

type OwnerIndex = {
  owner: string
  ids: string[]
}

const KEY_PREFIX = 'evn_live_'

function keyRecordPath(id: string): string {
  return `v1/apikeys/keys/${id}.json`
}

function ownerIndexPath(owner: string): string {
  return `v1/apikeys/by-owner/${pathId(owner)}.json`
}

function hashKey(secret: string): string {
  return createHash('sha256').update(secret).digest('hex')
}

function toPublic(rec: ApiKeyRecord): PublicApiKey {
  return {
    id: rec.id,
    name: rec.name,
    prefix: rec.prefix,
    projectId: rec.projectId,
    createdAt: rec.createdAt,
    lastUsedAt: rec.lastUsedAt,
    revokedAt: rec.revokedAt,
  }
}

async function readOwnerIndex(owner: string): Promise<OwnerIndex> {
  return (
    (await driver.getJson<OwnerIndex>(ownerIndexPath(owner))) ?? {
      owner,
      ids: [],
    }
  )
}

async function writeOwnerIndex(index: OwnerIndex): Promise<void> {
  await driver.putJson(ownerIndexPath(index.owner), index)
}

export async function listApiKeys(owner: string): Promise<PublicApiKey[]> {
  const index = await readOwnerIndex(owner)
  const keys = await Promise.all(
    index.ids.map((id) => driver.getJson<ApiKeyRecord>(keyRecordPath(id))),
  )
  return keys
    .filter((k): k is ApiKeyRecord => Boolean(k) && !k!.revokedAt)
    .map(toPublic)
    .sort((a, b) => b.createdAt - a.createdAt)
}

export async function createApiKey(
  owner: string,
  name: string,
  projectId?: string,
): Promise<PublicApiKey & { key: string }> {
  const trimmed = name.trim().slice(0, 64) || 'default'
  const id = randomBytes(8).toString('hex')
  const secret = randomBytes(24).toString('hex')
  const key = `${KEY_PREFIX}${id}_${secret}`
  const record: ApiKeyRecord = {
    id,
    owner,
    name: trimmed,
    projectId: projectId || undefined,
    keyHash: hashKey(key),
    prefix: `${KEY_PREFIX}${id}`,
    createdAt: Date.now(),
  }
  await driver.putJson(keyRecordPath(id), record)
  const index = await readOwnerIndex(owner)
  if (!index.ids.includes(id)) {
    index.ids.push(id)
    await writeOwnerIndex(index)
  }
  return { ...toPublic(record), key }
}

export async function revokeApiKey(owner: string, id: string): Promise<boolean> {
  const rec = await driver.getJson<ApiKeyRecord>(keyRecordPath(id))
  if (!rec || rec.owner !== owner) return false
  if (rec.revokedAt) return true
  rec.revokedAt = Date.now()
  await driver.putJson(keyRecordPath(id), rec)
  return true
}

export function looksLikeApiKey(token: string): boolean {
  return token.startsWith(KEY_PREFIX)
}

/** Resolve a raw API key to its owning wallet address, or null. */
export async function resolveApiKey(
  token: string,
): Promise<{ owner: string; keyId: string; keyName: string; projectId?: string } | null> {
  if (!looksLikeApiKey(token)) return null
  const rest = token.slice(KEY_PREFIX.length)
  const underscore = rest.indexOf('_')
  if (underscore < 1) return null
  const id = rest.slice(0, underscore)
  const rec = await driver.getJson<ApiKeyRecord>(keyRecordPath(id))
  if (!rec || rec.revokedAt) return null
  if (rec.keyHash !== hashKey(token)) return null
  rec.lastUsedAt = Date.now()
  await driver.putJson(keyRecordPath(id), rec).catch(() => undefined)
  return {
    owner: rec.owner,
    keyId: rec.id,
    keyName: rec.name,
    projectId: rec.projectId,
  }
}
