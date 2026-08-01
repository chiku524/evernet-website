import { objectKey } from './objectKey.js'
import type { StoredObjectMeta } from './store.js'

/** Object metadata returned to API clients — never expose internal blob locators. */
export type PublicObjectMeta = Omit<StoredObjectMeta, 'blobRef'> & { key: string }

export function publicObject(meta: StoredObjectMeta): PublicObjectMeta {
  const { blobRef: _blobRef, ...rest } = meta
  return { ...rest, key: objectKey(meta) }
}

export function publicObjects(list: StoredObjectMeta[]): PublicObjectMeta[] {
  return list.map(publicObject)
}
