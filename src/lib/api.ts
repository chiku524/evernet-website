import freighterApi from '@stellar/freighter-api'

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
  mimeType: string
  size: number
  encrypted: boolean
  createdAt: number
  shards: number
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

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const res = await fetch(`${apiBase()}${path}`, { ...init, headers })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
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

export async function loginWithFreighter(address: string): Promise<string> {
  const challenge = await api<{ challengeId: string; message: string }>('/auth/challenge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address }),
  })

  const signed = await freighterApi.signMessage(challenge.message, { address })
  if (signed.error) throw new Error(signed.error)
  const signature =
    (signed as { signedMessage?: string; signature?: string }).signedMessage ||
    (signed as { signature?: string }).signature
  if (!signature) throw new Error('Freighter did not return a signature')

  const result = await api<{ token: string; address: string }>('/auth/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      address,
      challengeId: challenge.challengeId,
      message: challenge.message,
      signature,
    }),
  })
  localStorage.setItem(TOKEN_KEY, result.token)
  localStorage.setItem(ADDR_KEY, result.address)
  return result.address
}

export async function getProfile(): Promise<ApiProfile> {
  return api<ApiProfile>('/profile')
}

export async function listObjects(): Promise<ApiObject[]> {
  const res = await api<{ objects: ApiObject[] }>('/objects')
  return res.objects
}

export async function uploadObject(file: Blob, meta: { name: string; mimeType: string; encrypted: boolean }) {
  const form = new FormData()
  form.append('file', file, meta.name)
  form.append('name', meta.name)
  form.append('mimeType', meta.mimeType)
  form.append('encrypted', String(meta.encrypted))
  const token = getToken()
  const res = await fetch(`${apiBase()}/objects`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Upload failed')
  return data as { object: ApiObject; profile: ApiProfile }
}

export async function downloadObject(hash: string): Promise<Blob> {
  const token = getToken()
  const res = await fetch(`${apiBase()}/objects/${hash}`, {
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
