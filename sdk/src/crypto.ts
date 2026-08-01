import type { EncryptedPayload } from './types.js'

function b64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}

function fromB64(s: string): Uint8Array {
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function subtle(): SubtleCrypto {
  const c = globalThis.crypto?.subtle
  if (!c) {
    throw new Error('Web Crypto API is required (use Node 18+ or a modern browser)')
  }
  return c
}

function asBufferSource(bytes: Uint8Array): BufferSource {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await subtle().importKey(
    'raw',
    asBufferSource(new TextEncoder().encode(passphrase)),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return subtle().deriveKey(
    { name: 'PBKDF2', salt: asBufferSource(salt), iterations: 100_000, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

function toArrayBuffer(data: Blob | ArrayBuffer | Uint8Array): Promise<ArrayBuffer> {
  if (data instanceof ArrayBuffer) return Promise.resolve(data)
  if (data instanceof Uint8Array) {
    return Promise.resolve(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer)
  }
  return data.arrayBuffer()
}

/** Encrypt bytes with AES-GCM. Packed as 4-byte header length + JSON header + ciphertext. */
export async function encryptBytes(
  data: Blob | ArrayBuffer | Uint8Array,
  passphrase: string,
  meta: { name: string; mimeType?: string },
): Promise<EncryptedPayload> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(passphrase, salt)
  const plain = await toArrayBuffer(data)
  const cipher = await subtle().encrypt({ name: 'AES-GCM', iv: asBufferSource(iv) }, key, plain)
  const header = {
    v: 1 as const,
    salt: b64(salt),
    iv: b64(iv),
    name: meta.name,
    mimeType: meta.mimeType || 'application/octet-stream',
  }
  const headerBytes = new TextEncoder().encode(JSON.stringify(header))
  const len = new Uint8Array(4)
  new DataView(len.buffer).setUint32(0, headerBytes.length, false)
  const packed = new Blob([asBufferSource(len), asBufferSource(headerBytes), cipher], {
    type: 'application/octet-stream',
  })
  return { ciphertext: packed, header }
}

/** Encrypt a File (browser) or Blob with a display name. */
export async function encryptFile(file: File, passphrase: string): Promise<EncryptedPayload> {
  return encryptBytes(file, passphrase, { name: file.name, mimeType: file.type || 'application/octet-stream' })
}

export async function decryptBlob(
  data: Blob,
  passphrase: string,
): Promise<{ file: Blob; name: string; mimeType: string }> {
  const buf = new Uint8Array(await data.arrayBuffer())
  const headerLen = new DataView(buf.buffer, buf.byteOffset, 4).getUint32(0, false)
  const headerJson = new TextDecoder().decode(buf.slice(4, 4 + headerLen))
  const header = JSON.parse(headerJson) as EncryptedPayload['header']
  const cipher = buf.slice(4 + headerLen)
  const key = await deriveKey(passphrase, fromB64(header.salt))
  const plain = await subtle().decrypt(
    { name: 'AES-GCM', iv: asBufferSource(fromB64(header.iv)) },
    key,
    asBufferSource(cipher),
  )
  return {
    file: new Blob([plain], { type: header.mimeType }),
    name: header.name,
    mimeType: header.mimeType,
  }
}

/**
 * Convenience passphrase derived from wallet address.
 * Useful for demos; prefer a strong user-chosen secret in production.
 */
export function walletPassphrase(address: string): string {
  return `evernet-v1:${address}`
}
