import { decryptBlob, encryptBytes, encryptFile } from './crypto.js'
import { EvernetError, EvernetUnreachableError } from './errors.js'
import type {
  ApiKeyInfo,
  CreatedApiKey,
  EncryptUploadInput,
  EvernetObject,
  EvernetProfile,
  EvernetProject,
  PublicConfig,
  UploadMeta,
  UsageInfo,
  VaultListing,
} from './types.js'

export type EvernetClientOptions = {
  baseUrl?: string
  /** Bearer JWT or API key (`evn_…`). */
  token?: string
  getToken?: () => string | null | undefined
  onToken?: (token: string, address: string) => void
  onClearToken?: () => void
  fetch?: typeof fetch
}

const DEFAULT_BASE = 'https://evernet-storage-api.vercel.app'

export class EvernetClient {
  readonly baseUrl: string
  private token: string | null
  private readonly getToken?: () => string | null | undefined
  private readonly onToken?: (token: string, address: string) => void
  private readonly onClearToken?: () => void
  private readonly fetchImpl: typeof fetch

  constructor(opts: EvernetClientOptions = {}) {
    this.baseUrl = (opts.baseUrl || DEFAULT_BASE).replace(/\/$/, '')
    this.token = opts.token ?? null
    this.getToken = opts.getToken
    this.onToken = opts.onToken
    this.onClearToken = opts.onClearToken
    this.fetchImpl = opts.fetch ?? globalThis.fetch.bind(globalThis)
  }

  setToken(token: string | null) {
    this.token = token
  }

  getTokenValue(): string | null {
    return this.token ?? this.getToken?.() ?? null
  }

  clearSession() {
    this.token = null
    this.onClearToken?.()
  }

  private async raw(path: string, init: RequestInit = {}): Promise<Response> {
    try {
      return await this.fetchImpl(`${this.baseUrl}${path}`, init)
    } catch {
      throw new EvernetUnreachableError(this.baseUrl)
    }
  }

  private authHeaders(extra?: HeadersInit): Headers {
    const headers = new Headers(extra)
    const token = this.getTokenValue()
    if (token) headers.set('Authorization', `Bearer ${token}`)
    return headers
  }

  private async json<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = this.authHeaders(init.headers)
    if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json')
    }
    const res = await this.raw(path, { ...init, headers })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      if (res.status === 401) this.clearSession()
      throw new EvernetError((data as { error?: string }).error || `API ${res.status}`, {
        status: res.status,
        body: data,
      })
    }
    return data as T
  }

  async health() {
    return this.json<{
      ok: boolean
      version?: string
      network: string
      onChain: boolean
      contractId: string | null
      storage: string
    }>('/health')
  }

  async getPublicConfig(): Promise<PublicConfig> {
    return this.json('/config/public')
  }

  /** Step 1 of wallet auth: fetch an unsubmittable challenge transaction. */
  async createChallenge(address: string): Promise<{ transaction: string; network: string }> {
    return this.json('/auth/challenge', {
      method: 'POST',
      body: JSON.stringify({ address }),
    })
  }

  /**
   * Step 2: exchange a wallet-signed challenge XDR for a JWT.
   * The transaction must not be submitted to the network.
   */
  async verify(address: string, signedTransaction: string): Promise<{ token: string; address: string }> {
    const result = await this.json<{ token: string; address: string }>('/auth/verify', {
      method: 'POST',
      body: JSON.stringify({ address, signedTransaction }),
    })
    this.token = result.token
    this.onToken?.(result.token, result.address)
    return result
  }

  /**
   * Convenience: create challenge, let `sign` produce signed XDR, verify.
   * `sign` typically wraps a wallet SDK or Keypair.sign.
   */
  async loginWithSigner(
    address: string,
    sign: (transactionXdr: string, networkPassphrase: string) => Promise<string>,
  ): Promise<string> {
    const challenge = await this.createChallenge(address)
    const signedTransaction = await sign(challenge.transaction, challenge.network)
    const result = await this.verify(address, signedTransaction)
    return result.address
  }

  async getProfile(): Promise<EvernetProfile> {
    return this.json('/profile')
  }

  async getUsage(): Promise<UsageInfo> {
    return this.json('/usage')
  }

  async list(): Promise<VaultListing> {
    const res = await this.json<{ objects: EvernetObject[]; folders?: string[] }>('/objects')
    return {
      objects: (res.objects || []).map((o) => ({ ...o, folder: o.folder || '' })),
      folders: res.folders || [],
    }
  }

  async upload(data: Blob, meta: UploadMeta) {
    const form = new FormData()
    form.append('file', data, meta.name)
    form.append('name', meta.name)
    form.append('mimeType', meta.mimeType || 'application/octet-stream')
    form.append('encrypted', String(meta.encrypted ?? false))
    form.append('folder', meta.folder || '')
    const res = await this.raw('/objects', {
      method: 'POST',
      headers: this.authHeaders(),
      body: form,
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new EvernetError((body as { error?: string }).error || 'Upload failed', {
        status: res.status,
        body,
      })
    }
    return body as { object: EvernetObject; profile: EvernetProfile; folders?: string[] }
  }

  /**
   * Canonical integrator path: encrypt client-side → PUT object → receive content hash
   * (and optional Soroban registrationTx).
   */
  async encryptAndUpload(input: EncryptUploadInput) {
    const { ciphertext, header } = await encryptBytes(input.data, input.passphrase, {
      name: input.name,
      mimeType: input.mimeType,
    })
    return this.upload(ciphertext, {
      name: input.name,
      mimeType: header.mimeType,
      folder: input.folder,
      encrypted: true,
    })
  }

  /** Browser helper: encrypt a File then upload. */
  async encryptAndUploadFile(file: File, passphrase: string, folder = '') {
    const { ciphertext, header } = await encryptFile(file, passphrase)
    return this.upload(ciphertext, {
      name: header.name,
      mimeType: header.mimeType,
      folder,
      encrypted: true,
    })
  }

  async download(hash: string): Promise<Blob> {
    const res = await this.raw(`/objects/${hash}`, { headers: this.authHeaders() })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new EvernetError((body as { error?: string }).error || 'Download failed', {
        status: res.status,
        body,
      })
    }
    return res.blob()
  }

  async downloadAndDecrypt(hash: string, passphrase: string) {
    const blob = await this.download(hash)
    return decryptBlob(blob, passphrase)
  }

  // —— S3-shaped cloud surface (`/s3/v1`) ——

  async s3List(opts: { prefix?: string; delimiter?: string } = {}) {
    const qs = new URLSearchParams()
    if (opts.prefix) qs.set('prefix', opts.prefix)
    if (opts.delimiter !== undefined) qs.set('delimiter', opts.delimiter)
    const q = qs.toString()
    return this.json<{
      contents: Array<{ key: string; hash: string; size: number; lastModified: number; mimeType: string }>
      commonPrefixes: string[]
      keyCount: number
    }>(`/s3/v1/objects${q ? `?${q}` : ''}`)
  }

  async s3Put(
    key: string,
    data: Blob | ArrayBuffer | Uint8Array,
    opts: { mimeType?: string; encrypted?: boolean; overwrite?: boolean } = {},
  ) {
    const bytes =
      data instanceof Blob
        ? new Uint8Array(await data.arrayBuffer())
        : data instanceof ArrayBuffer
          ? new Uint8Array(data)
          : data
    const qs = new URLSearchParams({ key })
    if (opts.overwrite === false) qs.set('overwrite', 'false')
    const res = await this.raw(`/s3/v1/object?${qs}`, {
      method: 'PUT',
      headers: this.authHeaders({
        'Content-Type': 'application/octet-stream',
        'X-Evernet-Mime': opts.mimeType || 'application/octet-stream',
        'X-Evernet-Encrypted': String(opts.encrypted ?? true),
      }),
      body: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new EvernetError((body as { error?: string }).error || 'S3 put failed', {
        status: res.status,
        body,
      })
    }
    return body as { key: string; object: EvernetObject; profile: EvernetProfile }
  }

  async s3Get(key: string, opts: { range?: string } = {}): Promise<Blob> {
    const headers = this.authHeaders()
    if (opts.range) headers.set('Range', opts.range)
    const res = await this.raw(`/s3/v1/object?key=${encodeURIComponent(key)}`, { headers })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new EvernetError((body as { error?: string }).error || 'S3 get failed', {
        status: res.status,
        body,
      })
    }
    return res.blob()
  }

  async s3Delete(key: string) {
    return this.json<{ ok: boolean; profile: EvernetProfile }>(
      `/s3/v1/object?key=${encodeURIComponent(key)}`,
      { method: 'DELETE' },
    )
  }

  async s3Presign(input: { key?: string; hash?: string; expiresInSec?: number }) {
    return this.json<{ url: string; token: string; expiresAt: number; key: string; hash: string }>(
      '/s3/v1/presign',
      { method: 'POST', body: JSON.stringify(input) },
    )
  }

  async s3CreateMultipart(input: { key: string; mimeType?: string; encrypted?: boolean }) {
    return this.json<{
      uploadId: string
      key: string
      expiresAt: number
      maxPartBytes: number
      maxParts: number
    }>('/s3/v1/multipart', { method: 'POST', body: JSON.stringify(input) })
  }

  async s3UploadPart(uploadId: string, partNumber: number, data: Blob | Uint8Array | ArrayBuffer) {
    const bytes =
      data instanceof Blob
        ? new Uint8Array(await data.arrayBuffer())
        : data instanceof ArrayBuffer
          ? new Uint8Array(data)
          : data
    const res = await this.raw(`/s3/v1/multipart/${uploadId}/${partNumber}`, {
      method: 'PUT',
      headers: this.authHeaders({ 'Content-Type': 'application/octet-stream' }),
      body: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new EvernetError((body as { error?: string }).error || 'Part upload failed', {
        status: res.status,
        body,
      })
    }
    return body as { uploadId: string; partNumber: number; etag: string; size: number }
  }

  async s3CompleteMultipart(
    uploadId: string,
    parts: Array<{ partNumber: number; etag?: string }>,
  ) {
    return this.json<{ key: string; object: EvernetObject; profile: EvernetProfile }>(
      `/s3/v1/multipart/${uploadId}/complete`,
      { method: 'POST', body: JSON.stringify({ parts }) },
    )
  }

  async s3AbortMultipart(uploadId: string) {
    return this.json<{ ok: boolean }>(`/s3/v1/multipart/${uploadId}`, { method: 'DELETE' })
  }

  async s3Head(key: string): Promise<{
    hash: string
    key: string
    size: number
    mimeType: string
    encrypted: boolean
  }> {
    const res = await this.raw(`/s3/v1/object?key=${encodeURIComponent(key)}`, {
      method: 'HEAD',
      headers: this.authHeaders(),
    })
    if (!res.ok) {
      throw new EvernetError(`S3 head failed (${res.status})`, { status: res.status })
    }
    return {
      hash: res.headers.get('X-Object-Hash') || '',
      key: decodeURIComponent(res.headers.get('X-Object-Key') || key),
      size: Number(res.headers.get('X-Object-Size') || 0),
      mimeType: res.headers.get('Content-Type') || 'application/octet-stream',
      encrypted: res.headers.get('X-Object-Encrypted') === 'true',
    }
  }

  async s3Copy(fromKey: string, toKey: string) {
    return this.json<{ key: string; object: EvernetObject; profile: EvernetProfile; copiedFrom: string }>(
      '/s3/v1/copy',
      { method: 'POST', body: JSON.stringify({ fromKey, toKey }) },
    )
  }

  async s3CreateGrant(input: {
    key?: string
    hash?: string
    expiresInSec?: number
    /** Stellar G-address restricted to that wallet, or '*' / omit for anyone with the link. */
    grantee?: string | null
  }) {
    return this.json<{
      id: string
      token: string
      url: string
      key: string
      hash: string
      expiresAt: number
      grantee: string | null
    }>('/s3/v1/grants', { method: 'POST', body: JSON.stringify(input) })
  }

  async s3ListGrants() {
    const res = await this.json<{
      grants: Array<{
        id: string
        key: string
        hash: string
        grantee: string | null
        expiresAt: number
        createdAt: number
      }>
    }>('/s3/v1/grants')
    return res.grants
  }

  async s3RevokeGrant(id: string) {
    return this.json<{ ok: boolean }>(`/s3/v1/grants/${id}`, { method: 'DELETE' })
  }

  /** Download via a share token (optionally with this client's Bearer if grantee-restricted). */
  async s3GetShared(token: string): Promise<Blob> {
    const res = await this.raw(`/s3/v1/shared/${encodeURIComponent(token)}`, {
      headers: this.authHeaders(),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new EvernetError((body as { error?: string }).error || 'Shared get failed', {
        status: res.status,
        body,
      })
    }
    return res.blob()
  }

  /**
   * Upload large ciphertext via multipart (≤16MB/part, ≤64 parts).
   * Encrypt first yourself, or pass already-encrypted bytes.
   */
  async s3MultipartPut(
    key: string,
    data: Blob | ArrayBuffer | Uint8Array,
    opts: { mimeType?: string; encrypted?: boolean; partSize?: number } = {},
  ) {
    const bytes =
      data instanceof Blob
        ? new Uint8Array(await data.arrayBuffer())
        : data instanceof ArrayBuffer
          ? new Uint8Array(data)
          : data
    const partSize = Math.min(Math.max(opts.partSize || 8 * 1024 * 1024, 256 * 1024), 16 * 1024 * 1024)
    const created = await this.s3CreateMultipart({
      key,
      mimeType: opts.mimeType,
      encrypted: opts.encrypted,
    })
    const parts: Array<{ partNumber: number; etag: string }> = []
    try {
      let offset = 0
      let partNumber = 1
      while (offset < bytes.length) {
        const chunk = bytes.subarray(offset, Math.min(offset + partSize, bytes.length))
        const uploaded = await this.s3UploadPart(created.uploadId, partNumber, chunk)
        parts.push({ partNumber, etag: uploaded.etag })
        offset += chunk.length
        partNumber += 1
      }
      return await this.s3CompleteMultipart(created.uploadId, parts)
    } catch (err) {
      await this.s3AbortMultipart(created.uploadId).catch(() => undefined)
      throw err
    }
  }

  async updateObject(hash: string, patch: { name?: string; folder?: string }) {
    return this.json<{ object: EvernetObject; folders: string[] }>(`/objects/${hash}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    })
  }

  async deleteObject(hash: string): Promise<EvernetProfile> {
    const res = await this.json<{ profile: EvernetProfile }>(`/objects/${hash}`, { method: 'DELETE' })
    return res.profile
  }

  async listFolders(): Promise<string[]> {
    const res = await this.json<{ folders: string[] }>('/folders')
    return res.folders
  }

  async createFolder(path: string): Promise<string[]> {
    const res = await this.json<{ folders: string[] }>('/folders', {
      method: 'POST',
      body: JSON.stringify({ path }),
    })
    return res.folders
  }

  async renameFolder(from: string, to: string) {
    return this.json<{ folders: string[]; moved: number }>('/folders', {
      method: 'PATCH',
      body: JSON.stringify({ from, to }),
    })
  }

  async deleteFolder(path: string, recursive = false) {
    const qs = new URLSearchParams({ path, recursive: String(recursive) })
    return this.json<{ folders: string[]; deletedHashes?: string[] }>(`/folders?${qs}`, {
      method: 'DELETE',
    })
  }

  async confirmPurchase(planId: string, txHash: string) {
    return this.json<{
      ok: boolean
      profile: EvernetProfile
      amount: string
      txHash: string
      explorerUrl: string
    }>('/purchases/confirm', {
      method: 'POST',
      body: JSON.stringify({ planId, txHash }),
    })
  }

  async listApiKeys(): Promise<ApiKeyInfo[]> {
    const res = await this.json<{ keys: ApiKeyInfo[] }>('/keys')
    return res.keys
  }

  async createApiKey(name: string, projectId?: string): Promise<CreatedApiKey> {
    return this.json('/keys', {
      method: 'POST',
      body: JSON.stringify({ name, projectId }),
    })
  }

  async revokeApiKey(id: string): Promise<void> {
    await this.json(`/keys/${id}`, { method: 'DELETE' })
  }

  async listProjects(): Promise<EvernetProject[]> {
    const res = await this.json<{ projects: EvernetProject[] }>('/projects')
    return res.projects
  }

  async createProject(input: { name: string; maxBytes?: number | null }): Promise<EvernetProject> {
    return this.json('/projects', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  }

  async updateProject(
    id: string,
    patch: { name?: string; maxBytes?: number | null },
  ): Promise<EvernetProject> {
    return this.json(`/projects/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    })
  }

  async archiveProject(id: string): Promise<void> {
    await this.json(`/projects/${id}`, { method: 'DELETE' })
  }
}
