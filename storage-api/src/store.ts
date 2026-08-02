import { createHash } from 'node:crypto'
import { config } from './config.js'
import { driver, pathId, randomKey } from './blobstore.js'
import { objectKey } from './objectKey.js'
import {
  childSegment,
  isUnderFolder,
  normalizeFileName,
  normalizeFolderPath,
  parentFolder,
} from './paths.js'

const VAULT_REV_KEEP = 12

export type Profile = {
  address: string
  quotaBytes: number
  usedBytes: number
  leaseExpires: number
  objectCount: number
}

export type VersioningStatus = 'Disabled' | 'Enabled' | 'Suspended'

export type LifecycleRule = {
  id: string
  enabled: boolean
  prefix: string
  /** Expire latest non–delete-marker after this many days. */
  expirationDays?: number
  /** Permanently delete noncurrent versions after this many days. */
  noncurrentDays?: number
  /** Abort incomplete multipart uploads older than this many days. */
  abortMultipartDays?: number
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
  /** Optional project billing pool that funded this upload. */
  projectId?: string
  /** Soft-deleted (trash). Blob retained until hard delete or purge. */
  deletedAt?: number
  /** S3-style version id (= content hash for byte versions; synthetic for delete markers). */
  versionId: string
  /** Latest version for this key (including delete markers). */
  isLatest: boolean
  /** Tombstone version when versioning is Enabled. */
  isDeleteMarker?: boolean
}

/** Soft-deleted objects are retained this long before automatic purge. */
export const TRASH_TTL_MS = 30 * 24 * 60 * 60 * 1000

export type VaultLedger = {
  owner: string
  folders: string[]
  objects: Record<string, StoredObjectMeta>
  updatedAt: number
  versioning?: VersioningStatus
  lifecycleRules?: LifecycleRule[]
  /** Last time lifecycle runner completed for this vault. */
  lifecycleLastRunAt?: number
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
  return {
    owner,
    folders: [],
    objects: {},
    updatedAt: 0,
    versioning: 'Disabled',
    lifecycleRules: [],
  }
}

/** Ensure versionId/isLatest exist; recompute isLatest per key when missing. */
function migrateVersionFields(
  objects: Record<string, StoredObjectMeta>,
): { objects: Record<string, StoredObjectMeta>; changed: boolean } {
  let changed = false
  const mapped: Record<string, StoredObjectMeta> = {}
  for (const [hash, raw] of Object.entries(objects || {})) {
    const meta = withFolder(raw as StoredObjectMeta)
    const versionId = meta.versionId || meta.hash || hash
    const next: StoredObjectMeta = {
      ...meta,
      hash: meta.hash || hash,
      versionId,
      isLatest: meta.isLatest ?? true,
      isDeleteMarker: meta.isDeleteMarker,
    }
    if (!raw.versionId || raw.isLatest === undefined) changed = true
    mapped[next.hash] = next
  }

  const byKey = new Map<string, StoredObjectMeta[]>()
  for (const obj of Object.values(mapped)) {
    if (obj.deletedAt) continue
    const key = objectKey(obj)
    const list = byKey.get(key) || []
    list.push(obj)
    byKey.set(key, list)
  }
  for (const group of byKey.values()) {
    if (group.length <= 1) {
      const only = group[0]
      if (only && only.isLatest !== true) {
        mapped[only.hash] = { ...only, isLatest: true }
        changed = true
      }
      continue
    }
    const hasExplicit = group.some((o) => o.isLatest === true)
    if (hasExplicit) {
      // Ensure at most one latest
      const sorted = [...group].sort((a, b) => b.createdAt - a.createdAt)
      let seen = false
      for (const o of sorted) {
        const want = !seen && o.isLatest
        if (o.isLatest) seen = true
        if (o.isLatest !== want) {
          mapped[o.hash] = { ...o, isLatest: want }
          changed = true
        }
      }
      if (!seen) {
        const newest = sorted[0]
        mapped[newest.hash] = { ...newest, isLatest: true }
        for (const o of sorted.slice(1)) {
          if (o.isLatest) {
            mapped[o.hash] = { ...mapped[o.hash], isLatest: false }
          }
        }
        changed = true
      }
      continue
    }
    const newest = [...group].sort((a, b) => b.createdAt - a.createdAt)[0]
    for (const o of group) {
      const want = o.hash === newest.hash
      if (o.isLatest !== want) {
        mapped[o.hash] = { ...o, isLatest: want }
        changed = true
      }
    }
  }
  return { objects: mapped, changed }
}

function normalizeVault(owner: string, existing: VaultLedger): {
  vault: VaultLedger
  migrated: boolean
} {
  const { objects, changed } = migrateVersionFields(existing.objects || {})
  const versioning = existing.versioning || 'Disabled'
  const lifecycleRules = existing.lifecycleRules || []
  const migrated = changed || !existing.versioning || !existing.lifecycleRules
  return {
    vault: {
      owner,
      folders: [
        ...new Set((existing.folders || []).map((f) => normalizeFolderPath(f)).filter(Boolean)),
      ],
      objects,
      updatedAt: existing.updatedAt || 0,
      versioning,
      lifecycleRules,
      lifecycleLastRunAt: existing.lifecycleLastRunAt,
    },
    migrated,
  }
}

async function latestVaultRevision(owner: string): Promise<{ vault: VaultLedger; migrated: boolean } | null> {
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
  if (fromRevisions) {
    if (fromRevisions.migrated) await saveVault(fromRevisions.vault)
    return fromRevisions.vault
  }

  const legacySingle = await driver.getJson<VaultLedger>(legacyVaultKey(owner))
  if (legacySingle?.objects) {
    const { vault } = normalizeVault(owner, legacySingle)
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
    vault.objects[meta.hash] = withFolder({
      ...meta,
      versionId: meta.versionId || meta.hash,
      isLatest: meta.isLatest ?? true,
    })
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
  const { vault: migrated } = normalizeVault(owner, vault)
  await saveVault(migrated)
  return migrated
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

export type ListObjectsOpts = {
  /** default: active only · true: active+trash · 'only': trash only */
  trash?: boolean | 'only'
  /**
   * default true: only latest non–delete-marker (current object listing).
   * false: all versions (including noncurrent + delete markers).
   */
  latestOnly?: boolean
}

function isTrashed(obj: StoredObjectMeta): boolean {
  return Boolean(obj.deletedAt)
}

export async function listObjects(
  owner: string,
  opts: ListObjectsOpts = {},
): Promise<StoredObjectMeta[]> {
  await purgeExpiredTrash(owner).catch(() => undefined)
  // Lazy lifecycle — dynamic import avoids circular init with lifecycle.ts
  try {
    const { applyLifecycle } = await import('./lifecycle.js')
    await applyLifecycle(owner)
  } catch {
    /* best-effort */
  }
  const vault = await loadVault(owner)
  let rows = Object.values(vault.objects)
  if (opts.trash === 'only') rows = rows.filter(isTrashed)
  else if (opts.trash !== true) rows = rows.filter((o) => !isTrashed(o))
  const latestOnly = opts.latestOnly !== false
  if (latestOnly && opts.trash !== 'only') {
    rows = rows.filter((o) => o.isLatest && !o.isDeleteMarker)
  }
  return rows.sort((a, b) => b.createdAt - a.createdAt)
}

export async function getObject(
  owner: string,
  hash: string,
  opts: { includeTrash?: boolean } = {},
): Promise<StoredObjectMeta | null> {
  const vault = await loadVault(owner)
  const obj = vault.objects[hash] ?? null
  if (!obj) return null
  if (isTrashed(obj) && !opts.includeTrash) return null
  return obj
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
    if (isTrashed(obj)) continue
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
): Promise<{ folders: string[]; trashedHashes: string[]; deletedHashes: string[] }> {
  const path = normalizeFolderPath(pathRaw)
  if (!path) throw new Error('Cannot delete the vault root')

  const vault = await loadVault(owner)
  const contained = Object.values(vault.objects).filter(
    (o) => !o.deletedAt && (o.folder === path || isUnderFolder(o.folder, path)),
  )

  if (contained.length && !recursive) {
    throw new Error('Folder is not empty — delete its contents first, or use recursive delete')
  }

  const trashedHashes: string[] = []
  const profile = await getProfile(owner)
  const now = Date.now()
  for (const obj of contained) {
    profile.usedBytes = Math.max(0, profile.usedBytes - obj.size)
    profile.objectCount = Math.max(0, profile.objectCount - 1)
    vault.objects[obj.hash] = { ...obj, deletedAt: now }
    trashedHashes.push(obj.hash)
  }

  vault.folders = vault.folders.filter((f) => f !== path && !isUnderFolder(f, path))
  await saveVault(vault)
  if (trashedHashes.length) await setProfile(profile)
  // deletedHashes kept for API compatibility (soft-delete → same list)
  return { folders: listFoldersFrom(vault), trashedHashes, deletedHashes: trashedHashes }
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

  const stored: StoredObjectMeta = {
    ...meta,
    folder,
    name,
    versionId: meta.versionId || meta.hash,
    isLatest: meta.isLatest ?? true,
  }
  vault.objects[stored.hash] = stored
  if (folder) rememberFolder(vault, folder)
  await saveVault(vault)
  await setProfile(profile)
  return profile
}

export async function getVersioning(owner: string): Promise<VersioningStatus> {
  const vault = await loadVault(owner)
  return vault.versioning || 'Disabled'
}

export async function setVersioning(owner: string, status: VersioningStatus): Promise<VersioningStatus> {
  if (status !== 'Disabled' && status !== 'Enabled' && status !== 'Suspended') {
    throw new Error('Invalid versioning status')
  }
  const vault = await loadVault(owner)
  vault.versioning = status
  await saveVault(vault)
  return status
}

export async function getLifecycleRules(owner: string): Promise<LifecycleRule[]> {
  const vault = await loadVault(owner)
  return vault.lifecycleRules || []
}

export async function setLifecycleRules(
  owner: string,
  rules: LifecycleRule[],
): Promise<LifecycleRule[]> {
  if (!Array.isArray(rules)) throw new Error('rules must be an array')
  if (rules.length > 100) throw new Error('At most 100 lifecycle rules')
  const normalized: LifecycleRule[] = rules.map((r, i) => {
    const id = String(r.id || `rule-${i + 1}`).slice(0, 64)
    const prefix = String(r.prefix || '').replace(/^\/+/, '')
    if (prefix.includes('..')) throw new Error('Invalid lifecycle prefix')
    const rule: LifecycleRule = {
      id,
      enabled: r.enabled !== false,
      prefix,
    }
    if (r.expirationDays != null) {
      const d = Number(r.expirationDays)
      if (!Number.isFinite(d) || d < 1) throw new Error('expirationDays must be >= 1')
      rule.expirationDays = Math.floor(d)
    }
    if (r.noncurrentDays != null) {
      const d = Number(r.noncurrentDays)
      if (!Number.isFinite(d) || d < 1) throw new Error('noncurrentDays must be >= 1')
      rule.noncurrentDays = Math.floor(d)
    }
    if (r.abortMultipartDays != null) {
      const d = Number(r.abortMultipartDays)
      if (!Number.isFinite(d) || d < 1) throw new Error('abortMultipartDays must be >= 1')
      rule.abortMultipartDays = Math.floor(d)
    }
    return rule
  })
  const vault = await loadVault(owner)
  vault.lifecycleRules = normalized
  await saveVault(vault)
  return normalized
}

/** Demote all latest versions for a key (active only). */
export async function demoteLatestForKey(
  owner: string,
  folder: string,
  name: string,
): Promise<void> {
  const vault = await loadVault(owner)
  const f = normalizeFolderPath(folder)
  const n = normalizeFileName(name)
  let changed = false
  for (const [hash, obj] of Object.entries(vault.objects)) {
    if (obj.deletedAt) continue
    if (normalizeFolderPath(obj.folder || '') !== f) continue
    if (normalizeFileName(obj.name) !== n) continue
    if (!obj.isLatest) continue
    vault.objects[hash] = { ...obj, isLatest: false }
    changed = true
  }
  if (changed) await saveVault(vault)
}

/** Create a delete-marker version as the new latest for a key. */
export async function createDeleteMarker(
  owner: string,
  folder: string,
  name: string,
  projectId?: string,
): Promise<StoredObjectMeta> {
  await demoteLatestForKey(owner, folder, name)
  const versionId = `dm-${randomKey()}`
  const meta: StoredObjectMeta = {
    hash: versionId,
    versionId,
    owner,
    name: normalizeFileName(name),
    folder: normalizeFolderPath(folder),
    mimeType: 'application/x-evernet-delete-marker',
    size: 0,
    encrypted: false,
    createdAt: Date.now(),
    shards: 0,
    blobRef: '',
    isLatest: true,
    isDeleteMarker: true,
    projectId,
  }
  await registerObjectLocal(meta)
  return meta
}

/** Set a version as latest for its key (delete markers allowed for internal repair). */
export async function setLatestVersion(
  owner: string,
  key: string,
  versionId: string,
): Promise<StoredObjectMeta> {
  const vault = await loadVault(owner)
  const target = Object.values(vault.objects).find(
    (o) =>
      !o.deletedAt &&
      objectKey(o) === key &&
      (o.versionId === versionId || o.hash === versionId),
  )
  if (!target) throw new Error('Version not found')

  const f = normalizeFolderPath(target.folder)
  const n = normalizeFileName(target.name)
  for (const [hash, obj] of Object.entries(vault.objects)) {
    if (obj.deletedAt) continue
    if (normalizeFolderPath(obj.folder || '') !== f) continue
    if (normalizeFileName(obj.name) !== n) continue
    vault.objects[hash] = { ...obj, isLatest: hash === target.hash }
  }
  await saveVault(vault)
  return vault.objects[target.hash]
}

/** Promote an existing non–delete-marker version to latest. */
export async function restoreVersionLocal(
  owner: string,
  key: string,
  versionId: string,
): Promise<StoredObjectMeta> {
  const vault = await loadVault(owner)
  const target = Object.values(vault.objects).find(
    (o) =>
      !o.deletedAt &&
      objectKey(o) === key &&
      (o.versionId === versionId || o.hash === versionId),
  )
  if (!target) throw new Error('Version not found')
  if (target.isDeleteMarker) throw new Error('Cannot restore a delete marker')
  return setLatestVersion(owner, key, versionId)
}

export async function getObjectByVersion(
  owner: string,
  key: string,
  versionId: string,
): Promise<StoredObjectMeta | null> {
  const vault = await loadVault(owner)
  return (
    Object.values(vault.objects).find(
      (o) =>
        !o.deletedAt &&
        objectKey(o) === key &&
        (o.versionId === versionId || o.hash === versionId),
    ) ?? null
  )
}

/** Internal: load vault for lifecycle runner. */
export async function loadVaultForLifecycle(owner: string): Promise<VaultLedger> {
  return loadVault(owner)
}

export async function markLifecycleRun(owner: string, at = Date.now()): Promise<void> {
  const vault = await loadVault(owner)
  vault.lifecycleLastRunAt = at
  await saveVault(vault)
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

/** Move object to trash (frees quota; blob kept for TRASH_TTL_MS). */
export async function trashObject(owner: string, hash: string): Promise<Profile> {
  const vault = await loadVault(owner)
  const meta = vault.objects[hash]
  if (!meta) throw new Error('Object missing')
  if (meta.deletedAt) return getProfile(owner)

  const profile = await getProfile(owner)
  profile.usedBytes = Math.max(0, profile.usedBytes - meta.size)
  profile.objectCount = Math.max(0, profile.objectCount - 1)
  vault.objects[hash] = { ...meta, deletedAt: Date.now() }
  await saveVault(vault)
  await setProfile(profile)
  return profile
}

/** Restore a trashed object (requires free quota). */
export async function restoreObject(owner: string, hash: string): Promise<StoredObjectMeta> {
  const vault = await loadVault(owner)
  const meta = vault.objects[hash]
  if (!meta) throw new Error('Object missing')
  if (!meta.deletedAt) return meta

  const profile = await getProfile(owner)
  if (profile.usedBytes + meta.size > profile.quotaBytes) {
    const err = new Error('Insufficient quota to restore') as Error & { status: number }
    err.status = 402
    throw err
  }
  profile.usedBytes += meta.size
  profile.objectCount += 1
  const { deletedAt: _deletedAt, ...rest } = meta
  const restored: StoredObjectMeta = { ...rest }
  vault.objects[hash] = restored
  if (restored.folder) rememberFolder(vault, restored.folder)
  await saveVault(vault)
  await setProfile(profile)
  return restored
}

/** Permanently delete object + blob. */
export async function deleteObjectLocal(owner: string, hash: string): Promise<Profile> {
  const vault = await loadVault(owner)
  const meta = vault.objects[hash]
  if (!meta) throw new Error('Object missing')

  const profile = await getProfile(owner)
  if (!meta.deletedAt) {
    profile.usedBytes = Math.max(0, profile.usedBytes - meta.size)
    profile.objectCount = Math.max(0, profile.objectCount - 1)
  }

  delete vault.objects[hash]
  await saveVault(vault)
  if (meta.blobRef && !meta.isDeleteMarker) {
    await driver.delBytes(meta.blobRef).catch(() => undefined)
  }
  await setProfile(profile)
  return profile
}

/** Hard-delete trash items older than TRASH_TTL_MS. Returns purged hashes. */
export async function purgeExpiredTrash(owner: string): Promise<string[]> {
  const vault = await loadVault(owner)
  const cutoff = Date.now() - TRASH_TTL_MS
  const expired = Object.values(vault.objects).filter(
    (o) => o.deletedAt && o.deletedAt < cutoff,
  )
  if (!expired.length) return []
  const purged: string[] = []
  for (const meta of expired) {
    delete vault.objects[meta.hash]
    purged.push(meta.hash)
    await driver.delBytes(meta.blobRef).catch(() => undefined)
  }
  await saveVault(vault)
  return purged
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
