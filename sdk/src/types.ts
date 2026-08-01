export type EvernetProfile = {
  address: string
  quotaBytes: number
  usedBytes: number
  leaseExpires: number
  objectCount: number
  source?: string
}

export type EvernetObject = {
  hash: string
  owner: string
  name: string
  folder: string
  mimeType: string
  size: number
  encrypted: boolean
  createdAt: number
  shards: number
  registrationTx?: string
}

export type VaultListing = {
  objects: EvernetObject[]
  folders: string[]
}

export type PublicConfig = {
  network: string
  networkPassphrase?: string
  treasury: string
  contractId: string | null
  onChain: boolean
  plans: { id: string; bytes: number; priceXlm: string }[]
  baseQuotaBytes: number
}

export type ApiKeyInfo = {
  id: string
  name: string
  prefix: string
  createdAt: number
  lastUsedAt?: number
  revokedAt?: number
}

export type CreatedApiKey = ApiKeyInfo & {
  /** Full secret — shown only once at creation. */
  key: string
}

export type UsageInfo = {
  profile: EvernetProfile
  auth: { type: 'jwt' | 'api_key'; keyId?: string; keyName?: string }
  limits: { requestsPerMinute: number }
}

export type EncryptedPayload = {
  ciphertext: Blob
  header: {
    v: 1
    salt: string
    iv: string
    name: string
    mimeType: string
  }
}

export type UploadMeta = {
  name: string
  mimeType?: string
  folder?: string
  encrypted?: boolean
}

export type EncryptUploadInput = {
  /** Raw bytes to encrypt before upload. */
  data: Blob | ArrayBuffer | Uint8Array
  name: string
  mimeType?: string
  folder?: string
  /** Encryption passphrase. Prefer a strong user secret over walletPassphrase(). */
  passphrase: string
}
