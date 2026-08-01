import { createHash } from 'node:crypto'
import { config } from './config.js'
import { driver, pathId, randomKey } from './blobstore.js'

const VAULT_REV_KEEP = 12
import {
  childSegment,
  isUnderFolder,
  normalizeFileName,
  normalizeFolderPath,
  parentFolder,
} from './paths.js'

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
  /** Relative folder path; empty string = vault root. */
  folder: string
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

type VaultLedger = {
  owner: string
  folders: string[]
  objects: Record<string, StoredObjectMeta>
  updatedAt: number
}

const PREFIX = 'v1'

function profileKey(address: string): string {
  return `${PREFIX}/profiles/${pathId(address)}.json`
}

/** Immutable revision directory — never overwrite the same Blob URL for vault state. */
function vaultDir(owner: string): string {
  return `${PREFIX}/vaults/${pathId(owner)}`
}

/** Older single-file vault key (overwrites were unreliable on the Blob CDN). */
function legacyVaultKey(owner: string): string {
  return `${PREFIX}/vaults/${pathId(owner)}.json`
}

/** Legacy per-object keys from the first blob layout. */
function legacyObjectDir(owner: string): string {
  return `${PREFIX}/objects/${pathId(owner)}`
}

function legacyFolderBookKey(owner: string): string {
  return `${PREFIX}/folders/${pathId(owner)}.json`
}

function paymentKey(paymentHash: string): string {
  return `${PREFIX}/payments/${pathId(paymentHash)}.json`
}

function withFolder(meta: StoredObjectMeta): StoredObjectMeta {
  return { ...meta, folder: normalizeFolderPath(meta.folder ?? '') }
}

function emptyVault(owner: string): VaultLedger {
  return { owner, folders: [], objects: {}, updatedAt: 0 }
}

function normalizeVault(owner: string, existing: VaultLedger): VaultLedger {
  return {
    owner,
    folders: [...new Set((existing.folders || []).map((f) => normalizeFolderPath(f)).filter(Boolean))],
    objects: Object.fromEntries(
      Object.entries(existing.objects || {}).map(([hash, meta]) => [hash, withFolder(meta)]),
    ),
    updatedAt: existing.updatedAt || 0,
  }
}

async function latestVaultRevision(owner: string): Promise<VaultLedger | null> {
  const keys = (await driver.listKeys(vaultDir(owner)))
    .filter((key) => /\/rev-\d{15}-[a-f0-9]+\.json$/i.test(key))
    .sort()
    .reverse()

  for (const key of keys.slice(0, 3)) {
    const parsed = await driver.getJson<VaultLedger>(key)
    if (parsed?.objects) return normalizeVault(owner, parsed)
  }
  return null
}

async function pruneVaultRevisions(owner: string): Promise<void> {
  try {
    const keys = (await driver.listKeys(vaultDir(owner)))
      .filter((key) => /\/rev-\d{15}-[a-f0-9]+\.json$/i.test(key))
      .sort()
      .reverse()
    await Promise.all(keys.slice(VAULT_REV_KEEP).map((key) => driver.delJson(key)))
  } catch {
    /* best-effort */
  }
}

async function loadVault(owner: string): Promise<VaultLedger> {
  const fromRevisions = await latestVaultRevision(owner)
  if (fromRevisions) return fromRevisions

  const legacySingle = await driver.getJson<VaultLedger>(legacyVaultKey(owner))
  if (legacySingle?.objects) {
    const vault = normalizeVault(owner, legacySingle)
    await saveVault(vault)
    return vault
  }

  // One-time migrate from the old per-object + folder-book layout.
  const [legacyObjects, legacyBook] = await Promise.all([
    driver.listJson<StoredObjectMeta>(legacyObjectDir(owner)),
    driver.getJson<{ folders?: string[] }>(legacyFolderBookKey(owner)),
  ])
  if (!legacyObjects.length && !legacyBook?.folders?.length) return emptyVault(owner)

  const vault = emptyVault(owner)
  for (const meta of legacyObjects) {
    if (meta.owner !== owner || !meta.hash) continue
    vault.objects[meta.hash] = withFolder(meta)
  }
  for (const folder of legacyBook?.folders || []) {
    const normalized = normalizeFolderPath(folder)
    if (normalized) vault.folders.push(normalized)
  }
  for (const meta of Object.values(vault.objects)) {
    let cursor = meta.folder
    while (cursor) {
      if (!vault.folders.includes(cursor)) vault.folders.push(cursor)
      cursor = parentFolder(cursor)
    }
  }
  vault.folders.sort()
  await saveVault(vault)
  return vault
}

async function saveVault(vault: VaultLedger): Promise<void> {
  vault.updatedAt = Date.now()
  vault.folders = [...new Set(vault.folders.map((f) => normalizeFolderPath(f)).filter(Boolean))].sort()
  const rev = `${vault.updatedAt.toString().padStart(15, '0')}-${randomKey().slice(0, 8)}`
  const key = `${vaultDir(vault.owner)}/rev-${rev}.json`
  await driver.putJson(key, vault)
  void pruneVaultRevisions(vault.owner)
}

function rememberFolder(vault: VaultLedger, path: string) {
  let cursor = normalizeFolderPath(path)
  while (cursor) {
    if (!vault.folders.includes(cursor)) vault.folders.push(cursor)
    cursor = parentFolder(cursor)
  }
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
  const vault = await loadVault(owner)
  return Object.values(vault.objects).sort((a, b) => b.createdAt - a.createdAt)
}

export async function getObject(owner: string, hash: string): Promise<StoredObjectMeta | null> {
  const vault = await loadVault(owner)
  return vault.objects[hash] ?? null
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

export async function ensureFolder(owner: string, path: string): Promise<string[]> {
  const target = normalizeFolderPath(path)
  const vault = await loadVault(owner)
  if (target) rememberFolder(vault, target)
  await saveVault(vault)
  return listFoldersFrom(vault)
}

function listFoldersFrom(vault: VaultLedger): string[] {
  const set = new Set(vault.folders)
  for (const obj of Object.values(vault.objects)) {
    let cursor = obj.folder
    while (cursor) {
      set.add(cursor)
      cursor = parentFolder(cursor)
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
}

export async function listFolders(owner: string): Promise<string[]> {
  return listFoldersFrom(await loadVault(owner))
}

export async function createFolder(owner: string, path: string): Promise<string[]> {
  const target = normalizeFolderPath(path)
  if (!target) throw new Error('Folder path required')
  return ensureFolder(owner, target)
}

export async function renameFolder(
  owner: string,
  fromRaw: string,
  toRaw: string,
): Promise<{ folders: string[]; moved: number }> {
  const from = normalizeFolderPath(fromRaw)
  const to = normalizeFolderPath(toRaw)
  if (!from) throw new Error('Source folder required')
  if (!to) throw new Error('Destination folder required')
  if (from === to) return { folders: await listFolders(owner), moved: 0 }
  if (isUnderFolder(to, from)) throw new Error('Cannot move a folder into itself')

  const vault = await loadVault(owner)
  const rewrite = (path: string) => {
    if (path === from) return to
    if (path.startsWith(`${from}/`)) return `${to}${path.slice(from.length)}`
    return path
  }

  let moved = 0
  for (const [hash, obj] of Object.entries(vault.objects)) {
    if (obj.folder !== from && !isUnderFolder(obj.folder, from)) continue
    vault.objects[hash] = { ...obj, folder: rewrite(obj.folder) }
    moved += 1
  }

  vault.folders = vault.folders
    .filter((folder) => folder !== from && !folder.startsWith(`${from}/`))
    .map(rewrite)
  rememberFolder(vault, to)
  await saveVault(vault)
  return { folders: listFoldersFrom(vault), moved }
}

export async function deleteFolder(
  owner: string,
  pathRaw: string,
  recursive: boolean,
): Promise<{ folders: string[]; deletedHashes: string[] }> {
  const path = normalizeFolderPath(pathRaw)
  if (!path) throw new Error('Cannot delete the vault root')

  const vault = await loadVault(owner)
  const contained = Object.values(vault.objects).filter(
    (o) => o.folder === path || isUnderFolder(o.folder, path),
  )

  if (contained.length && !recursive) {
    throw new Error('Folder is not empty — delete its contents first, or use recursive delete')
  }

  const deletedHashes: string[] = []
  const profile = await getProfile(owner)
  for (const obj of contained) {
    profile.usedBytes = Math.max(0, profile.usedBytes - obj.size)
    profile.objectCount = Math.max(0, profile.objectCount - 1)
    delete vault.objects[obj.hash]
    deletedHashes.push(obj.hash)
    await driver.delBytes(obj.blobRef).catch(() => undefined)
  }

  vault.folders = vault.folders.filter((f) => f !== path && !isUnderFolder(f, path))
  await saveVault(vault)
  if (deletedHashes.length) await setProfile(profile)
  return { folders: listFoldersFrom(vault), deletedHashes }
}

export async function registerObjectLocal(meta: StoredObjectMeta): Promise<Profile> {
  const vault = await loadVault(meta.owner)
  if (vault.objects[meta.hash]) throw new Error('Object already exists')

  const folder = normalizeFolderPath(meta.folder ?? '')
  const name = normalizeFileName(meta.name)
  const profile = await getProfile(meta.owner)
  if (meta.size > profile.quotaBytes - profile.usedBytes) {
    throw new Error('Insufficient quota')
  }
  profile.usedBytes += meta.size
  profile.objectCount += 1

  const stored: StoredObjectMeta = { ...meta, folder, name }
  vault.objects[stored.hash] = stored
  if (folder) rememberFolder(vault, folder)
  await saveVault(vault)
  await setProfile(profile)
  return profile
}

export async function patchObjectMeta(
  owner: string,
  hash: string,
  patch: Partial<StoredObjectMeta>,
): Promise<StoredObjectMeta | null> {
  const vault = await loadVault(owner)
  const current = vault.objects[hash]
  if (!current) return null

  const next: StoredObjectMeta = {
    ...current,
    ...patch,
    hash: current.hash,
    owner: current.owner,
    blobRef: patch.blobRef ?? current.blobRef,
    size: current.size,
  }
  if (patch.name !== undefined) next.name = normalizeFileName(patch.name)
  if (patch.folder !== undefined) next.folder = normalizeFolderPath(patch.folder)

  vault.objects[hash] = next
  if (next.folder) rememberFolder(vault, next.folder)
  await saveVault(vault)
  return next
}

export async function deleteObjectLocal(owner: string, hash: string): Promise<Profile> {
  const vault = await loadVault(owner)
  const meta = vault.objects[hash]
  if (!meta) throw new Error('Object missing')

  const profile = await getProfile(owner)
  profile.usedBytes = Math.max(0, profile.usedBytes - meta.size)
  profile.objectCount = Math.max(0, profile.objectCount - 1)

  delete vault.objects[hash]
  await saveVault(vault)
  await driver.delBytes(meta.blobRef).catch(() => undefined)
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

/** Immediate child folder names under `parent`. */
export function childFolders(allFolders: string[], parent: string): string[] {
  const names = new Set<string>()
  for (const folder of allFolders) {
    const seg = childSegment(folder, parent)
    if (seg) names.add(seg)
  }
  return [...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
}
