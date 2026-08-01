import { createHash } from 'node:crypto'
import { config } from './config.js'
import { driver, pathId, randomKey } from './blobstore.js'

export type Profile = {
  address: string
  quotaBytes: number
  usedBytes: number
  leaseExpires: number
  objectCount: number
}

export type StoredObjectMeta = {
  hash: string
  owner: string
  name: string
  mimeType: string
  size: number
  encrypted: boolean
  createdAt: number
  shards: number
  /** Locator for the encrypted bytes, resolved by the storage driver. */
  blobRef: string
  /** Stellar/Soroban tx hash from register_object */
  registrationTx?: string
}

const PREFIX = 'v1'

function profileKey(address: string): string {
  return `${PREFIX}/profiles/${pathId(address)}.json`
}

function objectDir(owner: string): string {
  return `${PREFIX}/objects/${pathId(owner)}`
}

function objectKey(owner: string, hash: string): string {
  return `${objectDir(owner)}/${pathId(hash)}.json`
}

function paymentKey(paymentHash: string): string {
  return `${PREFIX}/payments/${pathId(paymentHash)}.json`
}

export function defaultProfile(address: string): Profile {
  return {
    address,
    quotaBytes: config.baseQuotaBytes,
    usedBytes: 0,
    leaseExpires: 0,
    objectCount: 0,
  }
}

export async function getProfile(address: string): Promise<Profile> {
  const stored = await driver.getJson<Profile>(profileKey(address))
  return stored ?? defaultProfile(address)
}

export async function setProfile(profile: Profile): Promise<void> {
  await driver.putJson(profileKey(profile.address), profile)
}

export async function listObjects(owner: string): Promise<StoredObjectMeta[]> {
  const objects = await driver.listJson<StoredObjectMeta>(objectDir(owner))
  return objects.filter((o) => o.owner === owner).sort((a, b) => b.createdAt - a.createdAt)
}

export async function getObject(owner: string, hash: string): Promise<StoredObjectMeta | null> {
  return driver.getJson<StoredObjectMeta>(objectKey(owner, hash))
}

export async function paymentSeen(hash: string): Promise<boolean> {
  return Boolean(await driver.getJson(paymentKey(hash)))
}

export async function markPayment(hash: string, address: string, planId: string): Promise<void> {
  await driver.putJson(paymentKey(hash), { address, planId, at: Date.now() })
}

export function sha256Hex(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex')
}

export async function writeBlob(owner: string, data: Buffer): Promise<string> {
  const key = `${PREFIX}/data/${pathId(owner)}/${randomKey()}`
  return driver.putBytes(key, data, 'application/octet-stream')
}

export async function readBlob(meta: StoredObjectMeta): Promise<Buffer | null> {
  return driver.getBytes(meta.blobRef)
}

export async function registerObjectLocal(meta: StoredObjectMeta): Promise<Profile> {
  const existing = await getObject(meta.owner, meta.hash)
  if (existing) throw new Error('Object already exists')

  const profile = await getProfile(meta.owner)
  if (meta.size > profile.quotaBytes - profile.usedBytes) {
    throw new Error('Insufficient quota')
  }
  profile.usedBytes += meta.size
  profile.objectCount += 1

  await driver.putJson(objectKey(meta.owner, meta.hash), meta)
  await setProfile(profile)
  return profile
}

export async function patchObjectMeta(
  owner: string,
  hash: string,
  patch: Partial<StoredObjectMeta>,
): Promise<StoredObjectMeta | null> {
  const current = await getObject(owner, hash)
  if (!current) return null
  const next: StoredObjectMeta = { ...current, ...patch, hash: current.hash, owner: current.owner }
  await driver.putJson(objectKey(owner, hash), next)
  return next
}

export async function deleteObjectLocal(owner: string, hash: string): Promise<Profile> {
  const meta = await getObject(owner, hash)
  if (!meta) throw new Error('Object missing')

  const profile = await getProfile(owner)
  profile.usedBytes = Math.max(0, profile.usedBytes - meta.size)
  profile.objectCount = Math.max(0, profile.objectCount - 1)

  await driver.delJson(objectKey(owner, hash))
  await driver.delBytes(meta.blobRef)
  await setProfile(profile)
  return profile
}

export async function creditPurchaseLocal(
  address: string,
  planId: string,
  paymentHash: string,
): Promise<Profile> {
  if (await paymentSeen(paymentHash)) throw new Error('Payment already credited')
  const grant = config.planBytes[planId]
  if (!grant) throw new Error('Unknown plan')

  const profile = await getProfile(address)
  profile.quotaBytes += grant
  const now = Math.floor(Date.now() / 1000)
  profile.leaseExpires = (profile.leaseExpires > now ? profile.leaseExpires : now) + 30 * 86_400

  await setProfile(profile)
  await markPayment(paymentHash, address, planId)
  return profile
}
