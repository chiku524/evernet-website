import type { StellarNetworkId } from './stellar'
import { signTransactionXdr } from './wallet'

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

/**
 * SEP-10 style login: the API hands back an unsubmittable sequence-0
 * transaction and the wallet signs it. Every Stellar wallet can sign a
 * transaction, whereas arbitrary message signing is only implemented by some.
 */
export async function loginWithWallet(
  address: string,
  network: StellarNetworkId,
): Promise<string> {
  const challenge = await api<{ transaction: string; network: string }>('/auth/challenge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address }),
  })

  const signedTransaction = await signTransactionXdr(challenge.transaction, address, network)

  const result = await api<{ token: string; address: string }>('/auth/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, signedTransaction }),
  })
  localStorage.setItem(TOKEN_KEY, result.token)
  localStorage.setItem(ADDR_KEY, result.address)
  return result.address
}

export function hasSession(address: string): boolean {
  return Boolean(localStorage.getItem(TOKEN_KEY)) && sessionAddress() === address
}

export async function getProfile(): Promise<ApiProfile> {
  return api<ApiProfile>('/profile')
}

export async function listVault(): Promise<VaultListing> {
  const res = await api<{ objects: ApiObject[]; folders?: string[] }>('/objects')
  return {
    objects: (res.objects || []).map((o) => ({ ...o, folder: o.folder || '' })),
    folders: res.folders || [],
  }
}

/** @deprecated prefer listVault */
export async function listObjects(): Promise<ApiObject[]> {
  return (await listVault()).objects
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

export async function deleteObject(hash: string): Promise<ApiProfile> {
  const res = await api<{ profile: ApiProfile }>(`/objects/${hash}`, { method: 'DELETE' })
  return res.profile
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
