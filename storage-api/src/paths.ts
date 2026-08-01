/** Shared path helpers for vault folders. Paths are relative, slash-separated, no leading/trailing `/`. */

const MAX_DEPTH = 8
const MAX_SEGMENT = 64
const MAX_PATH = 256
const SEGMENT_RE = /^[\p{L}\p{N}][\p{L}\p{N} ._'()-]{0,63}$/u

export function normalizeFolderPath(input: unknown): string {
  if (input == null) return ''
  const raw = String(input).replace(/\\/g, '/').trim()
  if (!raw || raw === '/') return ''

  const parts = raw
    .split('/')
    .map((p) => p.trim())
    .filter(Boolean)

  if (parts.length > MAX_DEPTH) {
    throw new Error(`Folders can be at most ${MAX_DEPTH} levels deep`)
  }

  for (const part of parts) {
    if (part === '.' || part === '..') throw new Error('Invalid folder path')
    if (part.length > MAX_SEGMENT) throw new Error(`Folder names must be ≤ ${MAX_SEGMENT} characters`)
    if (!SEGMENT_RE.test(part)) {
      throw new Error(
        'Folder names may use letters, numbers, spaces, and . _ \' - ( ) — and must start with a letter or number',
      )
    }
  }

  const path = parts.join('/')
  if (path.length > MAX_PATH) throw new Error('Folder path is too long')
  return path
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

export function joinFolder(parent: string, name: string): string {
  const base = normalizeFolderPath(parent)
  const child = normalizeFolderPath(name)
  if (!child) throw new Error('Folder name required')
  if (child.includes('/')) throw new Error('Use a single folder name, not a path')
  return normalizeFolderPath(base ? `${base}/${child}` : child)
}

export function isUnderFolder(path: string, ancestor: string): boolean {
  const p = normalizeFolderPath(path)
  const a = normalizeFolderPath(ancestor)
  if (!a) return p !== ''
  return p === a || p.startsWith(`${a}/`)
}

export function childSegment(path: string, parent: string): string | null {
  const p = normalizeFolderPath(path)
  const a = normalizeFolderPath(parent)
  if (!p) return null
  if (!a) {
    return p.split('/')[0] ?? null
  }
  if (p === a) return null
  if (!p.startsWith(`${a}/`)) return null
  return p.slice(a.length + 1).split('/')[0] ?? null
}

export function normalizeFileName(input: unknown): string {
  const name = String(input ?? '')
    .replace(/[\\/]/g, '-')
    .replace(/^\.+/, '')
    .trim()
  if (!name) throw new Error('File name required')
  if (name.length > 180) throw new Error('File name is too long')
  return name
}
