export type DroppedFile = {
  file: File
  /** Relative folder path inside the drop (empty = current vault folder). */
  relativeFolder: string
}

async function readAllEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  const out: FileSystemEntry[] = []
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => {
      reader.readEntries(resolve, reject)
    })
    if (!batch.length) break
    out.push(...batch)
  }
  return out
}

async function walkEntry(entry: FileSystemEntry, parentPath: string): Promise<DroppedFile[]> {
  if (entry.isFile) {
    const fileEntry = entry as FileSystemFileEntry
    const file = await new Promise<File>((resolve, reject) => fileEntry.file(resolve, reject))
    return [{ file, relativeFolder: parentPath }]
  }
  if (entry.isDirectory) {
    const dirEntry = entry as FileSystemDirectoryEntry
    const nextParent = parentPath ? `${parentPath}/${entry.name}` : entry.name
    const children = await readAllEntries(dirEntry.createReader())
    const nested = await Promise.all(children.map((child) => walkEntry(child, nextParent)))
    return nested.flat()
  }
  return []
}

/**
 * Collect files from a drag-and-drop event. When the browser exposes directory
 * entries, nested folder structure is preserved as relativeFolder paths.
 */
export async function filesFromDataTransfer(dt: DataTransfer): Promise<DroppedFile[]> {
  const items = dt.items ? Array.from(dt.items) : []
  const entries = items
    .map((item) => item.webkitGetAsEntry?.() ?? null)
    .filter((e): e is FileSystemEntry => e !== null)

  if (entries.length) {
    const walked = await Promise.all(entries.map((entry) => walkEntry(entry, '')))
    const flat = walked.flat()
    if (flat.length) return flat
  }

  return Array.from(dt.files || []).map((file) => ({
    file,
    relativeFolder: '',
  }))
}
