import { normalizeFileName, normalizeFolderPath } from './paths.js'
import type { StoredObjectMeta } from './store.js'

/** S3-style object key: `folder/name` or `name` at vault root. */
export function objectKey(meta: Pick<StoredObjectMeta, 'folder' | 'name'>): string {
  const folder = normalizeFolderPath(meta.folder ?? '')
  const name = normalizeFileName(meta.name)
  return folder ? `${folder}/${name}` : name
}

export function parseObjectKey(key: unknown): { folder: string; name: string } {
  const raw = String(key ?? '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .trim()
  if (!raw) throw new Error('Object key required')
  if (raw.includes('..')) throw new Error('Invalid object key')
  const parts = raw.split('/').map((p) => p.trim()).filter(Boolean)
  if (!parts.length) throw new Error('Object key required')
  const name = normalizeFileName(parts[parts.length - 1])
  const folder = parts.length > 1 ? normalizeFolderPath(parts.slice(0, -1).join('/')) : ''
  return { folder, name }
}

export function findByKey(
  objects: StoredObjectMeta[],
  key: string,
  opts: { includeTrash?: boolean; includeDeleteMarkers?: boolean } = {},
): StoredObjectMeta | undefined {
  const parsed = parseObjectKey(key)
  const matches = objects.filter((o) => {
    if (o.deletedAt && !opts.includeTrash) return false
    return (
      normalizeFolderPath(o.folder || '') === parsed.folder &&
      normalizeFileName(o.name) === parsed.name
    )
  })
  if (!matches.length) return undefined
  const latest =
    matches.find((o) => o.isLatest) ||
    [...matches].sort((a, b) => b.createdAt - a.createdAt)[0]
  if (latest.isDeleteMarker && !opts.includeDeleteMarkers) return undefined
  return latest
}

export function findVersion(
  objects: StoredObjectMeta[],
  key: string,
  versionId: string,
  opts: { includeTrash?: boolean } = {},
): StoredObjectMeta | undefined {
  return objects.find((o) => {
    if (o.deletedAt && !opts.includeTrash) return false
    if (objectKey(o) !== key) return false
    return o.versionId === versionId || o.hash === versionId
  })
}

/** All versions under a prefix (for ListObjectVersions). */
export function listVersionsByPrefix(
  objects: StoredObjectMeta[],
  opts: { prefix?: string },
): Array<{
  key: string
  versionId: string
  hash: string
  size: number
  lastModified: number
  mimeType: string
  isLatest: boolean
  isDeleteMarker: boolean
}> {
  const prefix = String(opts.prefix || '').replace(/^\/+/, '')
  const rows: Array<{
    key: string
    versionId: string
    hash: string
    size: number
    lastModified: number
    mimeType: string
    isLatest: boolean
    isDeleteMarker: boolean
  }> = []

  for (const obj of objects) {
    if (obj.deletedAt) continue
    const key = objectKey(obj)
    if (prefix && !key.startsWith(prefix)) continue
    rows.push({
      key,
      versionId: obj.versionId || obj.hash,
      hash: obj.hash,
      size: obj.size,
      lastModified: obj.createdAt,
      mimeType: obj.mimeType,
      isLatest: Boolean(obj.isLatest),
      isDeleteMarker: Boolean(obj.isDeleteMarker),
    })
  }

  rows.sort((a, b) => {
    const k = a.key.localeCompare(b.key)
    if (k !== 0) return k
    return b.lastModified - a.lastModified
  })
  return rows
}

/** S3-style list with optional prefix + delimiter (usually `/`). */
export function listByPrefix(
  objects: StoredObjectMeta[],
  opts: { prefix?: string; delimiter?: string },
): {
  contents: Array<{
    key: string
    hash: string
    size: number
    lastModified: number
    mimeType: string
    versionId?: string
  }>
  commonPrefixes: string[]
} {
  const prefix = String(opts.prefix || '').replace(/^\/+/, '')
  const delimiter = opts.delimiter === undefined ? '' : String(opts.delimiter)
  const contents: Array<{
    key: string
    hash: string
    size: number
    lastModified: number
    mimeType: string
    versionId?: string
  }> = []
  const prefixSet = new Set<string>()

  for (const obj of objects) {
    if (obj.isDeleteMarker) continue
    const key = objectKey(obj)
    if (prefix && !key.startsWith(prefix)) continue

    if (delimiter) {
      const rest = key.slice(prefix.length)
      const cut = rest.indexOf(delimiter)
      if (cut >= 0) {
        prefixSet.add(prefix + rest.slice(0, cut + delimiter.length))
        continue
      }
    }

    contents.push({
      key,
      hash: obj.hash,
      size: obj.size,
      lastModified: obj.createdAt,
      mimeType: obj.mimeType,
      versionId: obj.versionId || obj.hash,
    })
  }

  contents.sort((a, b) => a.key.localeCompare(b.key))
  return { contents, commonPrefixes: [...prefixSet].sort() }
}
