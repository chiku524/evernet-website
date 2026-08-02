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
  /** S3-style key: `folder/name` or `name`. */
  key?: string
  mimeType: string
  size: number
  encrypted: boolean
  createdAt: number
  shards: number
  registrationTx?: string
  /** Soft-deleted; present while in trash (30d TTL). */
  deletedAt?: number
  trashed?: boolean
  versionId?: string
  isLatest?: boolean
  isDeleteMarker?: boolean
}

export type VersioningStatus = 'Disabled' | 'Enabled' | 'Suspended'

export type LifecycleRule = {
  id: string
  enabled: boolean
  prefix: string
  expirationDays?: number
  noncurrentDays?: number
  abortMultipartDays?: number
}

export type ObjectVersion = {
  key: string
  versionId: string
  hash: string
  size: number
  lastModified: number
  mimeType: string
  isLatest: boolean
  isDeleteMarker: boolean
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
  projectId?: string
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
  auth: { type: 'jwt' | 'api_key'; keyId?: string; keyName?: string; projectId?: string }
  project?: {
    id: string
    name: string
    maxBytes: number | null
    usedBytes: number
    remainingBytes: number | null
  } | null
  limits: { requestsPerMinute: number }
}

export type EvernetProject = {
  id: string
  name: string
  maxBytes: number | null
  usedBytes: number
  createdAt: number
  remainingBytes: number | null
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
