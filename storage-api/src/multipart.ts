import { createHash, randomBytes } from 'node:crypto'
import { driver, pathId, randomKey } from './blobstore.js'
import { parseObjectKey } from './objectKey.js'

export const MULTIPART_PART_MAX = 16 * 1024 * 1024
export const MULTIPART_MAX_PARTS = 64
export const MULTIPART_TTL_MS = 24 * 60 * 60 * 1000

export type MultipartPart = {
  partNumber: number
  size: number
  etag: string
  blobRef: string
}

export type MultipartSession = {
  uploadId: string
  owner: string
  key: string
  folder: string
  name: string
  mimeType: string
  encrypted: boolean
  projectId?: string
  parts: Record<string, MultipartPart>
  createdAt: number
  expiresAt: number
}

function sessionKey(owner: string, uploadId: string): string {
  return `v1/multipart/${pathId(owner)}/${uploadId}.json`
}

function partBlobKey(owner: string, uploadId: string, partNumber: number): string {
  return `v1/multipart/${pathId(owner)}/${uploadId}/part-${partNumber}-${randomKey()}`
}

export async function createMultipartSession(input: {
  owner: string
  key: string
  mimeType?: string
  encrypted?: boolean
  projectId?: string
}): Promise<MultipartSession> {
  const { folder, name } = parseObjectKey(input.key)
  const uploadId = randomBytes(12).toString('hex')
  const now = Date.now()
  const session: MultipartSession = {
    uploadId,
    owner: input.owner,
    key: folder ? `${folder}/${name}` : name,
    folder,
    name,
    mimeType: input.mimeType || 'application/octet-stream',
    encrypted: input.encrypted !== false,
    projectId: input.projectId,
    parts: {},
    createdAt: now,
    expiresAt: now + MULTIPART_TTL_MS,
  }
  await driver.putJson(sessionKey(input.owner, uploadId), session)
  return session
}

export async function getMultipartSession(
  owner: string,
  uploadId: string,
): Promise<MultipartSession | null> {
  const session = await driver.getJson<MultipartSession>(sessionKey(owner, uploadId))
  if (!session) return null
  if (session.owner !== owner) return null
  if (Date.now() > session.expiresAt) {
    await abortMultipartSession(owner, uploadId).catch(() => undefined)
    return null
  }
  return session
}

export async function saveMultipartSession(session: MultipartSession): Promise<void> {
  await driver.putJson(sessionKey(session.owner, session.uploadId), session)
}

export async function putMultipartPart(input: {
  owner: string
  uploadId: string
  partNumber: number
  data: Buffer
}): Promise<MultipartPart> {
  if (input.partNumber < 1 || input.partNumber > MULTIPART_MAX_PARTS) {
    throw new Error(`partNumber must be 1–${MULTIPART_MAX_PARTS}`)
  }
  if (input.data.length === 0) throw new Error('Empty part')
  if (input.data.length > MULTIPART_PART_MAX) {
    throw new Error(`Part exceeds ${MULTIPART_PART_MAX} bytes`)
  }
  const session = await getMultipartSession(input.owner, input.uploadId)
  if (!session) throw new Error('Upload session not found or expired')

  const existing = session.parts[String(input.partNumber)]
  if (existing) {
    await driver.delBytes(existing.blobRef).catch(() => undefined)
  }

  const key = partBlobKey(input.owner, input.uploadId, input.partNumber)
  const blobRef = await driver.putBytes(key, input.data, 'application/octet-stream')
  const etag = createHash('md5').update(input.data).digest('hex')
  const part: MultipartPart = {
    partNumber: input.partNumber,
    size: input.data.length,
    etag,
    blobRef,
  }
  session.parts[String(input.partNumber)] = part
  await saveMultipartSession(session)
  return part
}

export async function assembleMultipart(
  owner: string,
  uploadId: string,
  partNumbers: number[],
): Promise<{ session: MultipartSession; data: Buffer }> {
  const session = await getMultipartSession(owner, uploadId)
  if (!session) throw new Error('Upload session not found or expired')
  if (!partNumbers.length) throw new Error('parts required')

  const chunks: Buffer[] = []
  let total = 0
  for (const n of partNumbers) {
    const part = session.parts[String(n)]
    if (!part) throw new Error(`Missing part ${n}`)
    const buf = await driver.getBytes(part.blobRef)
    if (!buf) throw new Error(`Part ${n} data missing`)
    chunks.push(buf)
    total += buf.length
  }
  if (total > MULTIPART_PART_MAX * MULTIPART_MAX_PARTS) {
    throw new Error('Assembled object too large')
  }
  return { session, data: Buffer.concat(chunks, total) }
}

export async function abortMultipartSession(owner: string, uploadId: string): Promise<boolean> {
  const session = await driver.getJson<MultipartSession>(sessionKey(owner, uploadId))
  if (!session || session.owner !== owner) return false
  await Promise.all(
    Object.values(session.parts).map((p) => driver.delBytes(p.blobRef).catch(() => undefined)),
  )
  await driver.delJson(sessionKey(owner, uploadId)).catch(() => undefined)
  return true
}

export async function cleanupMultipartSession(owner: string, uploadId: string): Promise<void> {
  await abortMultipartSession(owner, uploadId)
}

function multipartOwnerDir(owner: string): string {
  return `v1/multipart/${pathId(owner)}`
}

/** List incomplete multipart sessions for an owner. */
export async function listMultipartSessions(owner: string): Promise<MultipartSession[]> {
  const keys = await driver.listKeys(multipartOwnerDir(owner))
  const sessionKeys = keys.filter((k) => k.endsWith('.json') && !k.includes('/part-'))
  const sessions: MultipartSession[] = []
  for (const key of sessionKeys) {
    const session = await driver.getJson<MultipartSession>(key)
    if (session?.owner === owner && session.uploadId) sessions.push(session)
  }
  return sessions
}

/** Abort sessions whose createdAt is older than cutoffMs ago. Returns aborted uploadIds. */
export async function abortMultipartOlderThan(
  owner: string,
  maxAgeMs: number,
): Promise<string[]> {
  const cutoff = Date.now() - maxAgeMs
  const sessions = await listMultipartSessions(owner)
  const aborted: string[] = []
  for (const session of sessions) {
    if (session.createdAt <= cutoff) {
      const ok = await abortMultipartSession(owner, session.uploadId)
      if (ok) aborted.push(session.uploadId)
    }
  }
  return aborted
}
