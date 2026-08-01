import { createHash, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import path from 'node:path'
import { config } from './config.js'

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
}

type DbShape = {
  profiles: Record<string, Profile>
  objects: Record<string, StoredObjectMeta>
  payments: Record<string, { address: string; planId: string; at: number }>
  challenges: Record<string, { address: string; expires: number }>
}

const dbPath = path.join(config.dataDir, 'ledger.json')

function load(): DbShape {
  if (!existsSync(dbPath)) {
    return { profiles: {}, objects: {}, payments: {}, challenges: {} }
  }
  return JSON.parse(readFileSync(dbPath, 'utf8')) as DbShape
}

function save(db: DbShape) {
  writeFileSync(dbPath, JSON.stringify(db, null, 2))
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

export function getProfile(address: string): Profile {
  const db = load()
  return db.profiles[address] ?? defaultProfile(address)
}

export function setProfile(profile: Profile) {
  const db = load()
  db.profiles[profile.address] = profile
  save(db)
}

export function listObjects(owner: string): StoredObjectMeta[] {
  const db = load()
  return Object.values(db.objects)
    .filter((o) => o.owner === owner)
    .sort((a, b) => b.createdAt - a.createdAt)
}

export function getObject(hash: string): StoredObjectMeta | null {
  const db = load()
  return db.objects[hash] ?? null
}

export function paymentSeen(hash: string): boolean {
  const db = load()
  return Boolean(db.payments[hash])
}

export function markPayment(hash: string, address: string, planId: string) {
  const db = load()
  db.payments[hash] = { address, planId, at: Date.now() }
  save(db)
}

export function createChallenge(address: string): { challengeId: string; message: string } {
  const db = load()
  const challengeId = randomBytes(16).toString('hex')
  const expires = Date.now() + 5 * 60 * 1000
  db.challenges[challengeId] = { address, expires }
  save(db)
  const message = `Evernet storage auth\nAddress: ${address}\nChallenge: ${challengeId}\nExpires: ${expires}`
  return { challengeId, message }
}

export function consumeChallenge(challengeId: string, address: string): boolean {
  const db = load()
  const row = db.challenges[challengeId]
  if (!row) return false
  if (row.address !== address) return false
  if (Date.now() > row.expires) {
    delete db.challenges[challengeId]
    save(db)
    return false
  }
  delete db.challenges[challengeId]
  save(db)
  return true
}

export function sha256Hex(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex')
}

export function blobPath(hash: string): string {
  const dir = path.join(config.blobDir, hash.slice(0, 2))
  mkdirSync(dir, { recursive: true })
  return path.join(dir, hash)
}

export function writeBlob(hash: string, data: Buffer) {
  writeFileSync(blobPath(hash), data)
}

export function readBlob(hash: string): Buffer | null {
  const p = blobPath(hash)
  if (!existsSync(p)) return null
  return readFileSync(p)
}

export function deleteBlob(hash: string) {
  const p = blobPath(hash)
  if (existsSync(p)) unlinkSync(p)
}

export function registerObjectLocal(meta: StoredObjectMeta): Profile {
  const db = load()
  if (db.objects[meta.hash]) {
    throw new Error('Object already exists')
  }
  const profile = db.profiles[meta.owner] ?? defaultProfile(meta.owner)
  const remaining = profile.quotaBytes - profile.usedBytes
  if (meta.size > remaining) {
    throw new Error('Insufficient quota')
  }
  profile.usedBytes += meta.size
  profile.objectCount += 1
  db.profiles[meta.owner] = profile
  db.objects[meta.hash] = meta
  save(db)
  return profile
}

export function deleteObjectLocal(owner: string, hash: string): Profile {
  const db = load()
  const obj = db.objects[hash]
  if (!obj) throw new Error('Object missing')
  if (obj.owner !== owner) throw new Error('Unauthorized')
  const profile = db.profiles[owner] ?? defaultProfile(owner)
  profile.usedBytes = Math.max(0, profile.usedBytes - obj.size)
  profile.objectCount = Math.max(0, profile.objectCount - 1)
  db.profiles[owner] = profile
  delete db.objects[hash]
  save(db)
  deleteBlob(hash)
  return profile
}

export function creditPurchaseLocal(address: string, planId: string, paymentHash: string): Profile {
  if (paymentSeen(paymentHash)) throw new Error('Payment already credited')
  const grant = config.planBytes[planId]
  if (!grant) throw new Error('Unknown plan')
  const db = load()
  const profile = db.profiles[address] ?? defaultProfile(address)
  profile.quotaBytes += grant
  const now = Math.floor(Date.now() / 1000)
  const add = 30 * 86_400
  profile.leaseExpires = (profile.leaseExpires > now ? profile.leaseExpires : now) + add
  db.profiles[address] = profile
  db.payments[paymentHash] = { address, planId, at: Date.now() }
  save(db)
  return profile
}
