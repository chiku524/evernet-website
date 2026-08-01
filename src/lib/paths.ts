/** Client-side folder path helpers. Keep in sync with storage-api/src/paths.ts rules. */

const MAX_DEPTH = 8
const MAX_SEGMENT = 64
const SEGMENT_RE = /^[\p{L}\p{N}][\p{L}\p{N} ._'()-]{0,63}$/u

export function normalizeFolderPath(input: unknown): string {
  if (input == null) return ''
  const raw = String(input).replace(/\\/g, '/').trim()
  if (!raw || raw === '/') return ''

  const parts = raw
    .split('/')
    .map((p) => p.trim())
    .filter(Boolean)

  if (parts.length > MAX_DEPTH) throw new Error(`Folders can be at most ${MAX_DEPTH} levels deep`)

  for (const part of parts) {
    if (part === '.' || part === '..') throw new Error('Invalid folder path')
    if (part.length > MAX_SEGMENT) throw new Error(`Folder names must be ≤ ${MAX_SEGMENT} characters`)
    if (!SEGMENT_RE.test(part)) {
      throw new Error(
        'Folder names may use letters, numbers, spaces, and . _ \' - ( ) — and must start with a letter or number',
      )
    }
  }
  return parts.join('/')
}

export function joinFolder(parent: string, name: string): string {
  const base = normalizeFolderPath(parent)
  const child = normalizeFolderPath(name)
  if (!child) throw new Error('Folder name required')
  if (child.includes('/')) throw new Error('Use a single folder name, not a path')
  return normalizeFolderPath(base ? `${base}/${child}` : child)
}

export function parentFolder(path: string): string {
  const normalized = normalizeFolderPath(path)
  if (!normalized) return ''
  const i = normalized.lastIndexOf('/')
  return i === -1 ? '' : normalized.slice(0, i)
}

export function folderName(path: string): string {
  const normalized = normalizeFolderPath(path)
  if (!normalized) return ''
  const i = normalized.lastIndexOf('/')
  return i === -1 ? normalized : normalized.slice(i + 1)
}

export function breadcrumbs(path: string): { label: string; path: string }[] {
  const normalized = normalizeFolderPath(path)
  const crumbs: { label: string; path: string }[] = [{ label: 'Vault', path: '' }]
  if (!normalized) return crumbs
  const parts = normalized.split('/')
  let cursor = ''
  for (const part of parts) {
    cursor = cursor ? `${cursor}/${part}` : part
    crumbs.push({ label: part, path: cursor })
  }
  return crumbs
}

export function childFolders(allFolders: string[], parent: string): string[] {
  const a = normalizeFolderPath(parent)
  const names = new Set<string>()
  for (const folder of allFolders) {
    const p = normalizeFolderPath(folder)
    if (!p) continue
    if (!a) {
      names.add(p.split('/')[0]!)
      continue
    }
    if (p === a || !p.startsWith(`${a}/`)) continue
    names.add(p.slice(a.length + 1).split('/')[0]!)
  }
  return [...names].sort((x, y) => x.localeCompare(y, undefined, { sensitivity: 'base' }))
}

export function objectsInFolder<T extends { folder?: string }>(items: T[], folder: string): T[] {
  const current = normalizeFolderPath(folder)
  return items.filter((item) => normalizeFolderPath(item.folder ?? '') === current)
}

/** Count files directly in a folder or any nested child. */
export function countUnderFolder<T extends { folder?: string }>(items: T[], folder: string): number {
  const current = normalizeFolderPath(folder)
  if (!current) return items.length
  return items.filter((item) => {
    const f = normalizeFolderPath(item.folder ?? '')
    return f === current || f.startsWith(`${current}/`)
  }).length
}
