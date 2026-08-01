import { getTotalQuotaBytes } from './billing'

const DB_NAME = 'evernet-vault'
const DB_VERSION = 1
const STORE = 'items'

export function getQuotaBytes() {
  return getTotalQuotaBytes()
}

export type VaultItem = {
  id: string
  name: string
  kind: 'file' | 'folder'
  parentId: string | null
  mimeType: string
  size: number
  createdAt: number
  updatedAt: number
  encrypted: boolean
  shards: number
  starred: boolean
  trashed: boolean
  blob?: Blob
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' })
        store.createIndex('parentId', 'parentId', { unique: false })
        store.createIndex('trashed', 'trashed', { unique: false })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** i
  return `${value < 10 && i > 0 ? value.toFixed(1) : Math.round(value)} ${units[i]}`
}

export function fileIconKind(mime: string, name: string): 'image' | 'video' | 'audio' | 'doc' | 'code' | 'archive' | 'file' {
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'
  if (mime.includes('zip') || mime.includes('tar') || /\.(zip|rar|7z|tar|gz)$/i.test(name)) return 'archive'
  if (/\.(ts|tsx|js|jsx|py|rs|go|json|md|css|html)$/i.test(name) || mime.includes('javascript') || mime.includes('json'))
    return 'code'
  if (mime.includes('pdf') || mime.includes('document') || mime.includes('text') || /\.(pdf|doc|txt|csv)$/i.test(name))
    return 'doc'
  return 'file'
}

async function getAll(): Promise<VaultItem[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll()
    req.onsuccess = () => resolve(req.result as VaultItem[])
    req.onerror = () => reject(req.error)
  })
}

async function putItem(item: VaultItem): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(STORE, 'readwrite')
  tx.objectStore(STORE).put(item)
  await txDone(tx)
}

async function deleteItem(id: string): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(STORE, 'readwrite')
  tx.objectStore(STORE).delete(id)
  await txDone(tx)
}

function uid(): string {
  return crypto.randomUUID()
}

const SEED_KEY = 'evernet-vault-seeded'

async function seedIfEmpty(): Promise<void> {
  if (localStorage.getItem(SEED_KEY)) return
  const existing = await getAll()
  if (existing.length > 0) {
    localStorage.setItem(SEED_KEY, '1')
    return
  }

  const now = Date.now()
  const docsId = uid()
  const mediaId = uid()
  const contractsId = uid()

  const samples: VaultItem[] = [
    {
      id: docsId,
      name: 'Documents',
      kind: 'folder',
      parentId: null,
      mimeType: 'folder',
      size: 0,
      createdAt: now - 86400000 * 12,
      updatedAt: now - 86400000 * 2,
      encrypted: true,
      shards: 0,
      starred: true,
      trashed: false,
    },
    {
      id: mediaId,
      name: 'Media',
      kind: 'folder',
      parentId: null,
      mimeType: 'folder',
      size: 0,
      createdAt: now - 86400000 * 10,
      updatedAt: now - 86400000 * 1,
      encrypted: true,
      shards: 0,
      starred: false,
      trashed: false,
    },
    {
      id: contractsId,
      name: 'Contracts',
      kind: 'folder',
      parentId: docsId,
      mimeType: 'folder',
      size: 0,
      createdAt: now - 86400000 * 8,
      updatedAt: now - 86400000 * 3,
      encrypted: true,
      shards: 0,
      starred: false,
      trashed: false,
    },
    {
      id: uid(),
      name: 'Evernet-Strategy.pdf',
      kind: 'file',
      parentId: docsId,
      mimeType: 'application/pdf',
      size: 482_000,
      createdAt: now - 86400000 * 7,
      updatedAt: now - 86400000 * 7,
      encrypted: true,
      shards: 8,
      starred: true,
      trashed: false,
      blob: new Blob(['Evernet strategy document (demo placeholder)'], { type: 'application/pdf' }),
    },
    {
      id: uid(),
      name: 'identity-vault-notes.txt',
      kind: 'file',
      parentId: docsId,
      mimeType: 'text/plain',
      size: 12_400,
      createdAt: now - 86400000 * 5,
      updatedAt: now - 86400000 * 1,
      encrypted: true,
      shards: 4,
      starred: false,
      trashed: false,
      blob: new Blob(['Encrypted notes for identity vault demo.'], { type: 'text/plain' }),
    },
    {
      id: uid(),
      name: 'soroban-storage-lease.json',
      kind: 'file',
      parentId: contractsId,
      mimeType: 'application/json',
      size: 3_280,
      createdAt: now - 86400000 * 4,
      updatedAt: now - 86400000 * 4,
      encrypted: true,
      shards: 4,
      starred: false,
      trashed: false,
      blob: new Blob([JSON.stringify({ asset: 'XLM', leaseDays: 30, nodes: 12 }, null, 2)], {
        type: 'application/json',
      }),
    },
    {
      id: uid(),
      name: 'network-topology.png',
      kind: 'file',
      parentId: mediaId,
      mimeType: 'image/png',
      size: 1_240_000,
      createdAt: now - 86400000 * 3,
      updatedAt: now - 86400000 * 3,
      encrypted: true,
      shards: 12,
      starred: false,
      trashed: false,
    },
    {
      id: uid(),
      name: 'archive-q2.zip',
      kind: 'file',
      parentId: null,
      mimeType: 'application/zip',
      size: 48_200_000,
      createdAt: now - 86400000 * 20,
      updatedAt: now - 86400000 * 15,
      encrypted: true,
      shards: 24,
      starred: false,
      trashed: false,
    },
  ]

  const db = await openDb()
  const tx = db.transaction(STORE, 'readwrite')
  for (const item of samples) tx.objectStore(STORE).put(item)
  await txDone(tx)
  localStorage.setItem(SEED_KEY, '1')
}

export async function listItems(): Promise<VaultItem[]> {
  await seedIfEmpty()
  return getAll()
}

export async function getUsageBytes(): Promise<number> {
  const items = await getAll()
  return items.filter((i) => i.kind === 'file' && !i.trashed).reduce((sum, i) => sum + i.size, 0)
}

export async function createFolder(name: string, parentId: string | null): Promise<VaultItem> {
  const now = Date.now()
  const item: VaultItem = {
    id: uid(),
    name: name.trim() || 'Untitled folder',
    kind: 'folder',
    parentId,
    mimeType: 'folder',
    size: 0,
    createdAt: now,
    updatedAt: now,
    encrypted: true,
    shards: 0,
    starred: false,
    trashed: false,
  }
  await putItem(item)
  return item
}

export async function uploadFiles(files: FileList | File[], parentId: string | null): Promise<VaultItem[]> {
  const list = Array.from(files)
  const used = await getUsageBytes()
  const incoming = list.reduce((sum, f) => sum + f.size, 0)
  const quota = getTotalQuotaBytes()
  if (used + incoming > quota) {
    throw new Error(
      `Not enough storage. Need ${formatBytes(incoming)}, ${formatBytes(Math.max(0, quota - used))} free. Buy more with XLM.`,
    )
  }

  const created: VaultItem[] = []
  const now = Date.now()
  for (const file of list) {
    const item: VaultItem = {
      id: uid(),
      name: file.name,
      kind: 'file',
      parentId,
      mimeType: file.type || 'application/octet-stream',
      size: file.size,
      createdAt: now,
      updatedAt: now,
      encrypted: true,
      shards: Math.max(4, Math.min(32, Math.ceil(file.size / (256 * 1024)) * 4)),
      starred: false,
      trashed: false,
      blob: file,
    }
    await putItem(item)
    created.push(item)
  }
  return created
}

export async function renameItem(id: string, name: string): Promise<void> {
  const items = await getAll()
  const item = items.find((i) => i.id === id)
  if (!item) return
  item.name = name.trim() || item.name
  item.updatedAt = Date.now()
  await putItem(item)
}

export async function toggleStar(id: string): Promise<void> {
  const items = await getAll()
  const item = items.find((i) => i.id === id)
  if (!item) return
  item.starred = !item.starred
  item.updatedAt = Date.now()
  await putItem(item)
}

export async function moveToTrash(id: string): Promise<void> {
  const items = await getAll()
  const toTrash = new Set<string>()

  const walk = (parent: string) => {
    toTrash.add(parent)
    for (const child of items.filter((i) => i.parentId === parent)) {
      if (child.kind === 'folder') walk(child.id)
      else toTrash.add(child.id)
    }
  }
  walk(id)

  const db = await openDb()
  const tx = db.transaction(STORE, 'readwrite')
  const store = tx.objectStore(STORE)
  for (const item of items) {
    if (toTrash.has(item.id)) {
      item.trashed = true
      item.updatedAt = Date.now()
      store.put(item)
    }
  }
  await txDone(tx)
}

export async function restoreItem(id: string): Promise<void> {
  const items = await getAll()
  const item = items.find((i) => i.id === id)
  if (!item) return
  item.trashed = false
  item.updatedAt = Date.now()
  await putItem(item)
}

export async function purgeItem(id: string): Promise<void> {
  const items = await getAll()
  const toDelete = new Set<string>()
  const walk = (parent: string) => {
    toDelete.add(parent)
    for (const child of items.filter((i) => i.parentId === parent)) {
      if (child.kind === 'folder') walk(child.id)
      else toDelete.add(child.id)
    }
  }
  walk(id)
  for (const delId of toDelete) await deleteItem(delId)
}

export async function downloadItem(id: string): Promise<void> {
  const items = await getAll()
  const item = items.find((i) => i.id === id)
  if (!item || item.kind !== 'file') return
  const blob = item.blob ?? new Blob([`Demo placeholder for ${item.name}`], { type: item.mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = item.name
  a.click()
  URL.revokeObjectURL(url)
}
