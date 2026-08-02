import { Networks } from '@stellar/stellar-sdk'
import type { StellarNetworkId } from './stellar'
import { signTransactionXdr } from './wallet'

function networkIdFromPassphrase(passphrase: string): StellarNetworkId {
  return passphrase === Networks.PUBLIC ? 'public' : 'testnet'
}

const TOKEN_KEY = 'evernet-api-token'
const ADDR_KEY = 'evernet-api-address'

export function apiBase(): string {
  return (import.meta.env.VITE_STORAGE_API_URL || 'http://localhost:8787').replace(/\/$/, '')
}

export type ApiProfile = {
  address: string
  quotaBytes: number
  usedBytes: number
  leaseExpires: number
  objectCount: number
  source?: string
}

export type ApiObject = {
  hash: string
  owner: string
  name: string
  /** Relative folder path; empty string = vault root. */
  folder: string
  /** S3-style key (`folder/name`), when returned by the API. */
  key?: string
  mimeType: string
  size: number
  encrypted: boolean
  createdAt: number
  shards: number
  /** Soroban register_object transaction hash */
  registrationTx?: string
  deletedAt?: number
  trashed?: boolean
}

export type VaultListing = {
  objects: ApiObject[]
  folders: string[]
}

function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(ADDR_KEY)
}

export function sessionAddress(): string | null {
  return localStorage.getItem(ADDR_KEY)
}

export class ApiUnreachableError extends Error {
  constructor(base: string) {
    super(`Could not reach the Evernet storage API at ${base}. Check your connection and retry.`)
    this.name = 'ApiUnreachableError'
  }
}

async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  try {
    return await fetch(`${apiBase()}${path}`, init)
  } catch {
    throw new ApiUnreachableError(apiBase())
  }
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const res = await apiFetch(path, { ...init, headers })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    if (res.status === 401) clearSession()
    throw new Error((data as { error?: string }).error || `API ${res.status}`)
  }
  return data as T
}

export async function fetchPublicConfig() {
  return api<{
    network: string
    treasury: string
    contractId: string | null
    onChain: boolean
    plans: { id: string; bytes: number; priceXlm: string }[]
    baseQuotaBytes: number
  }>('/config/public')
}

/** Prevents overlapping SEP-10 logins (WalletConnect must not enqueue a second sign). */
let loginInFlight: Promise<string> | null = null

/**
 * SEP-10 style login: the API hands back an unsubmittable sequence-0
 * transaction and the wallet signs it. Every Stellar wallet can sign a
 * transaction, whereas arbitrary message signing is only implemented by some.
 */
export async function loginWithWallet(
  address: string,
  network: StellarNetworkId,
): Promise<string> {
  if (hasSession(address)) return address
  if (loginInFlight) return loginInFlight

  loginInFlight = (async () => {
    const challenge = await api<{ transaction: string; network: string }>('/auth/challenge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address }),
    })

    // Challenge passphrase is authoritative (API STELLAR_NETWORK), not UI state.
    const challengeNetwork = networkIdFromPassphrase(challenge.network)
    if (challengeNetwork !== network) {
      throw new Error(
        `Evernet API is on ${challengeNetwork === 'public' ? 'Mainnet' : 'Testnet'}, but this vault is set to ${network === 'public' ? 'Mainnet' : 'Testnet'}. Refresh and try again.`,
      )
    }

    const signedTransaction = await signTransactionXdr(
      challenge.transaction,
      address,
      challengeNetwork,
      challenge.network,
    )

    try {
      const result = await api<{ token: string; address: string }>('/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, signedTransaction }),
      })
      localStorage.setItem(TOKEN_KEY, result.token)
      localStorage.setItem(ADDR_KEY, result.address)
      return result.address
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (/invalid wallet signature|invalid signature/i.test(message)) {
        throw new Error(
          'Invalid signature — the wallet likely signed on the wrong network. Evernet is on Testnet: disconnect in LOBSTR → WalletConnect, switch to Testnet, then connect again.',
        )
      }
      throw err
    }
  })().finally(() => {
    loginInFlight = null
  })

  return loginInFlight
}

export function hasSession(address: string): boolean {
  return Boolean(localStorage.getItem(TOKEN_KEY)) && sessionAddress() === address
}

export async function getProfile(): Promise<ApiProfile> {
  return api<ApiProfile>('/profile')
}

export async function listVault(opts: { trash?: boolean | 'only' } = {}): Promise<VaultListing> {
  const qs = new URLSearchParams()
  if (opts.trash === true) qs.set('trash', 'true')
  else if (opts.trash === 'only') qs.set('trash', 'only')
  const q = qs.toString()
  const res = await api<{ objects: ApiObject[]; folders?: string[] }>(
    `/objects${q ? `?${q}` : ''}`,
  )
  return {
    objects: (res.objects || []).map((o) => ({ ...o, folder: o.folder || '' })),
    folders: res.folders || [],
  }
}

/** @deprecated prefer listVault */
export async function listObjects(opts: { trash?: boolean | 'only' } = {}): Promise<ApiObject[]> {
  return (await listVault(opts)).objects
}

export async function createFolder(path: string): Promise<string[]> {
  const res = await api<{ folders: string[] }>('/folders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  })
  return res.folders
}

export async function renameFolder(from: string, to: string): Promise<{ folders: string[]; moved: number }> {
  return api('/folders', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to }),
  })
}

export async function deleteFolder(path: string, recursive = false): Promise<{ folders: string[] }> {
  const qs = new URLSearchParams({ path, recursive: String(recursive) })
  return api(`/folders?${qs}`, { method: 'DELETE' })
}

export async function uploadObject(
  file: Blob,
  meta: { name: string; mimeType: string; encrypted: boolean; folder?: string },
) {
  const form = new FormData()
  form.append('file', file, meta.name)
  form.append('name', meta.name)
  form.append('mimeType', meta.mimeType)
  form.append('encrypted', String(meta.encrypted))
  form.append('folder', meta.folder || '')
  const token = getToken()
  const res = await apiFetch('/objects', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error || 'Upload failed')
  return data as { object: ApiObject; profile: ApiProfile; folders?: string[] }
}

export async function updateObject(
  hash: string,
  patch: { name?: string; folder?: string },
): Promise<{ object: ApiObject; folders: string[] }> {
  return api(`/objects/${hash}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
}

export async function downloadObject(hash: string): Promise<Blob> {
  const token = getToken()
  const res = await apiFetch(`/objects/${hash}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error((data as { error?: string }).error || 'Download failed')
  }
  return res.blob()
}

export async function deleteObject(
  hash: string,
  opts: { permanent?: boolean } = {},
): Promise<{ profile: ApiProfile; trashed?: boolean; permanent?: boolean; trashTtlMs?: number }> {
  const qs = opts.permanent ? '?permanent=true' : ''
  return api(`/objects/${hash}${qs}`, { method: 'DELETE' })
}

export async function restoreObject(hash: string): Promise<{
  object: ApiObject
  folders: string[]
  profile: ApiProfile
}> {
  return api(`/objects/${hash}/restore`, { method: 'POST' })
}

export async function confirmPurchase(planId: string, txHash: string) {
  return api<{
    ok: boolean
    profile: ApiProfile
    amount: string
    txHash: string
    explorerUrl: string
  }>('/purchases/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ planId, txHash }),
  })
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

export async function listApiKeys(): Promise<ApiKeyInfo[]> {
  const res = await api<{ keys: ApiKeyInfo[] }>('/keys')
  return res.keys
}

export async function createApiKey(
  name: string,
  projectId?: string,
): Promise<ApiKeyInfo & { key: string }> {
  return api('/keys', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, projectId }),
  })
}

export async function revokeApiKey(id: string): Promise<void> {
  await api(`/keys/${id}`, { method: 'DELETE' })
}

export type ApiProject = {
  id: string
  name: string
  maxBytes: number | null
  usedBytes: number
  createdAt: number
  remainingBytes: number | null
}

export async function listProjects(): Promise<ApiProject[]> {
  const res = await api<{ projects: ApiProject[] }>('/projects')
  return res.projects
}

export async function createProject(input: {
  name: string
  maxBytes?: number | null
}): Promise<ApiProject> {
  return api('/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export async function archiveProject(id: string): Promise<void> {
  await api(`/projects/${id}`, { method: 'DELETE' })
}

export type ShareGrantCreated = {
  id: string
  token: string
  url: string
  key: string
  hash: string
  expiresAt: number
  grantee: string | null
}

export async function createShareGrant(input: {
  key?: string
  hash?: string
  expiresInSec?: number
  grantee?: string | null
}): Promise<ShareGrantCreated> {
  return api('/s3/v1/grants', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export type VersioningStatus = 'Disabled' | 'Enabled' | 'Suspended'

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

export type LifecycleRule = {
  id: string
  enabled: boolean
  prefix: string
  expirationDays?: number
  noncurrentDays?: number
  abortMultipartDays?: number
}

export async function getVersioning(): Promise<VersioningStatus> {
  const res = await api<{ status: VersioningStatus }>('/s3/v1/versioning')
  return res.status
}

export async function setVersioning(status: VersioningStatus): Promise<VersioningStatus> {
  const res = await api<{ status: VersioningStatus }>('/s3/v1/versioning', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  })
  return res.status
}

export async function listObjectVersions(prefix = ''): Promise<ObjectVersion[]> {
  const qs = prefix ? `?prefix=${encodeURIComponent(prefix)}` : ''
  const res = await api<{ versions: ObjectVersion[] }>(`/s3/v1/versions${qs}`)
  return res.versions || []
}

export async function restoreObjectVersion(key: string, versionId: string) {
  return api<{ object: ApiObject; profile: ApiProfile }>('/s3/v1/restore-version', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, versionId }),
  })
}

export async function deleteObjectVersion(key: string, versionId: string) {
  return api(`/s3/v1/object?key=${encodeURIComponent(key)}&versionId=${encodeURIComponent(versionId)}`, {
    method: 'DELETE',
  })
}

export async function getLifecycleRules(): Promise<LifecycleRule[]> {
  const res = await api<{ rules: LifecycleRule[] }>('/s3/v1/lifecycle')
  return res.rules || []
}

export async function setLifecycleRules(rules: LifecycleRule[]): Promise<LifecycleRule[]> {
  const res = await api<{ rules: LifecycleRule[] }>('/s3/v1/lifecycle', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rules }),
  })
  return res.rules
}
