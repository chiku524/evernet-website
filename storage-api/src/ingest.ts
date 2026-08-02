import { creditProjectUpload, debitProjectUpload, getProject } from './projects.js'
import {
  deleteObjectLocal,
  demoteLatestForKey,
  getObject,
  getVersioning,
  patchObjectMeta,
  registerObjectLocal,
  sha256Hex,
  writeBlob,
  type StoredObjectMeta,
  type Profile,
} from './store.js'
import { deleteObjectOnChain, getMergedProfile, registerObjectOnChain } from './soroban.js'
import { objectKey } from './objectKey.js'
import { normalizeFileName, normalizeFolderPath } from './paths.js'

export type IngestInput = {
  owner: string
  data: Buffer
  name: string
  folder?: string
  mimeType?: string
  encrypted?: boolean
  projectId?: string
  /** When true, replace or version prior object at the same key. */
  overwriteKey?: boolean
  existingByKey?: StoredObjectMeta | null
}

export type IngestResult = {
  object: StoredObjectMeta
  profile: Profile
}

/**
 * Shared write path for classic /objects, S3 put, and multipart complete.
 */
export async function ingestObject(input: IngestInput): Promise<IngestResult> {
  const owner = input.owner
  const name = normalizeFileName(input.name)
  const folder = normalizeFolderPath(input.folder)
  const mimeType = input.mimeType || 'application/octet-stream'
  const encrypted = input.encrypted !== false
  const buf = input.data
  const hash = sha256Hex(buf)
  const versioning = await getVersioning(owner)
  const versioningOn = versioning === 'Enabled'

  const existingSameHash = await getObject(owner, hash)
  if (existingSameHash) {
    const sameKey =
      normalizeFolderPath(existingSameHash.folder || '') === folder &&
      normalizeFileName(existingSameHash.name) === name
    if (sameKey && existingSameHash.isLatest && !existingSameHash.isDeleteMarker) {
      const profile = await getMergedProfile(owner)
      return { object: existingSameHash, profile }
    }
    if (sameKey && versioningOn && !existingSameHash.isLatest) {
      // Re-upload of an older version's bytes: promote it to latest.
      await demoteLatestForKey(owner, folder, name)
      const promoted =
        (await patchObjectMeta(owner, hash, { isLatest: true, isDeleteMarker: false })) ||
        existingSameHash
      return { object: promoted, profile: await getMergedProfile(owner) }
    }
    const err = new Error('You already stored this exact file') as Error & {
      status: number
      hash: string
    }
    err.status = 409
    err.hash = hash
    throw err
  }

  if (input.overwriteKey && input.existingByKey && input.existingByKey.hash !== hash) {
    const prev = input.existingByKey
    if (versioningOn) {
      await demoteLatestForKey(owner, folder, name)
    } else {
      await deleteObjectLocal(owner, prev.hash)
      await deleteObjectOnChain({ owner, hashHex: prev.hash }).catch(() => undefined)
      if (prev.projectId) {
        await debitProjectUpload(prev.projectId, prev.size).catch(() => undefined)
      }
    }
  } else if (versioningOn && input.overwriteKey) {
    // Delete marker or empty key — still demote any latest (incl. delete markers)
    await demoteLatestForKey(owner, folder, name)
  }

  const profile = await getMergedProfile(owner)
  if (profile.usedBytes + buf.length > profile.quotaBytes) {
    const err = new Error('Insufficient quota') as Error & {
      status: number
      remaining: number
      need: number
    }
    err.status = 402
    err.remaining = Math.max(0, profile.quotaBytes - profile.usedBytes)
    err.need = buf.length
    throw err
  }

  if (input.projectId) {
    const project = await getProject(input.projectId)
    if (!project || project.archivedAt || project.owner !== owner) {
      const err = new Error('Invalid project for API key') as Error & { status: number }
      err.status = 400
      throw err
    }
    if (project.maxBytes != null && project.usedBytes + buf.length > project.maxBytes) {
      const err = new Error(
        `Project quota exceeded (${project.usedBytes + buf.length} > ${project.maxBytes})`,
      ) as Error & { status: number }
      err.status = 402
      throw err
    }
  }

  const blobRef = await writeBlob(owner, buf)
  const meta: StoredObjectMeta = {
    hash,
    versionId: hash,
    owner,
    name,
    folder,
    mimeType,
    size: buf.length,
    encrypted,
    createdAt: Date.now(),
    shards: Math.max(4, Math.min(32, Math.ceil(buf.length / (256 * 1024)) * 4)),
    blobRef,
    projectId: input.projectId,
    isLatest: true,
    isDeleteMarker: false,
  }

  const updated = await registerObjectLocal(meta)
  if (input.projectId) {
    const credited = await creditProjectUpload(input.projectId, buf.length)
    if (!credited.ok) {
      await deleteObjectLocal(owner, hash).catch(() => undefined)
      const err = new Error(credited.error) as Error & { status: number }
      err.status = 402
      throw err
    }
  }

  const registrationTx = await registerObjectOnChain({ owner, hashHex: hash, size: buf.length })
  const object = registrationTx
    ? ((await patchObjectMeta(owner, hash, { registrationTx })) ?? { ...meta, registrationTx })
    : meta

  void objectKey(object)
  return { object, profile: updated }
}
