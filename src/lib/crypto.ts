/** Client-side AES-GCM encryption for vault uploads. */

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

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt.buffer as ArrayBuffer, iterations: 100_000, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export type EncryptedPayload = {
  ciphertext: Blob
  /** JSON header stored alongside / as prefix metadata in filename body */
  header: {
    v: 1
    salt: string
    iv: string
    name: string
    mimeType: string
  }
}

export async function encryptFile(file: File, passphrase: string): Promise<EncryptedPayload> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(passphrase, salt)
  const plain = await file.arrayBuffer()
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain)
  const header = {
    v: 1 as const,
    salt: b64(salt),
    iv: b64(iv),
    name: file.name,
    mimeType: file.type || 'application/octet-stream',
  }
  // Pack: 4-byte header length + header JSON + ciphertext
  const headerBytes = new TextEncoder().encode(JSON.stringify(header))
  const len = new Uint8Array(4)
  new DataView(len.buffer).setUint32(0, headerBytes.length, false)
  const packed = new Blob([len, headerBytes, cipher], { type: 'application/octet-stream' })
  return { ciphertext: packed, header }
}

export async function decryptBlob(data: Blob, passphrase: string): Promise<{ file: Blob; name: string; mimeType: string }> {
  const buf = new Uint8Array(await data.arrayBuffer())
  const headerLen = new DataView(buf.buffer, buf.byteOffset, 4).getUint32(0, false)
  const headerJson = new TextDecoder().decode(buf.slice(4, 4 + headerLen))
  const header = JSON.parse(headerJson) as EncryptedPayload['header']
  const cipher = buf.slice(4 + headerLen)
  const key = await deriveKey(passphrase, fromB64(header.salt))
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64(header.iv).buffer as ArrayBuffer },
    key,
    cipher.buffer.slice(cipher.byteOffset, cipher.byteOffset + cipher.byteLength) as ArrayBuffer,
  )
  return {
    file: new Blob([plain], { type: header.mimeType }),
    name: header.name,
    mimeType: header.mimeType,
  }
}

/** Default passphrase derived from wallet address — convenient but less secure than user passphrase. */
export function walletPassphrase(address: string): string {
  return `evernet-v1:${address}`
}
