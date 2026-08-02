import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { BuyStorageModal } from '../components/dashboard/BuyStorageModal'
import { PassphraseModal } from '../components/dashboard/PassphraseModal'
import {
  type ApiKeyInfo,
  type ApiObject,
  type ApiProfile,
  type ApiProject,
  apiBase,
  archiveProject,
  clearSession,
  createApiKey,
  createFolder,
  createProject,
  createShareGrant,
  deleteFolder,
  deleteObject,
  deleteObjectVersion,
  downloadObject,
  fetchPublicConfig,
  getProfile,
  getVersioning,
  hasSession,
  listApiKeys,
  listObjectVersions,
  listProjects,
  listVault,
  loginWithWallet,
  renameFolder,
  restoreObject,
  restoreObjectVersion,
  revokeApiKey,
  sessionAddress,
  setVersioning,
  updateObject,
  uploadObject,
  type ObjectVersion,
  type VersioningStatus,
} from '../lib/api'
import { decryptBlob, encryptFile } from '../lib/crypto'
import { clearVaultPassphrase, resolveVaultPassphrase } from '../lib/vault-passphrase'
import { fileIconKind, formatBytes } from '../lib/format'
import { filesFromDataTransfer } from '../lib/fs-drop'
import {
  breadcrumbs,
  childFolders,
  countUnderFolder,
  joinFolder,
  normalizeFolderPath,
  objectsInFolder,
  parentFolder,
} from '../lib/paths'
import {
  STORAGE_CONTRACT_ID,
  explorerContractUrl,
  explorerTxUrl,
  loadPreferredNetwork,
  saveAddress,
  shortenAddress,
  type StellarNetworkId,
} from '../lib/stellar'
import {
  clearWalletConnectPendingAuth,
  connectWallet,
  disconnectWallet,
  isMobileClient,
  isWalletConnectSelected,
  isWalletInAppBrowser,
  openWalletProfile,
  peekWalletConnectPendingAuth,
  restoreWallet,
  walletConnectConfigured,
} from '../lib/wallet'

function Icon({ kind }: { kind: ReturnType<typeof fileIconKind> | 'folder' }) {
  const common = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true as const }
  if (kind === 'folder') {
    return (
      <svg {...common}>
        <path
          d="M3.5 7.5A1.5 1.5 0 0 1 5 6h4.2l1.5 1.8H19a1.5 1.5 0 0 1 1.5 1.5V18A1.5 1.5 0 0 1 19 19.5H5A1.5 1.5 0 0 1 3.5 18V7.5Z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
    )
  }
  return (
    <svg {...common}>
      <path
        d="M7 3.5h6.5L19 9v11.5A1.5 1.5 0 0 1 17.5 22h-10A1.5 1.5 0 0 1 6 20.5v-15A1.5 1.5 0 0 1 7.5 4"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path d="M13 3.5V9h5.5" stroke="currentColor" strokeWidth="1.6" />
      {(kind === 'image' || kind === 'video') && <circle cx="10" cy="14" r="1.4" fill="currentColor" />}
    </svg>
  )
}

function formatDate(ts: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(ts))
}

type FolderRow = { kind: 'folder'; name: string; path: string; count: number }
type FileRow = { kind: 'file'; object: ApiObject }
type Row = FolderRow | FileRow

export default function Dashboard() {
  const [wallet, setWallet] = useState<string | null>(null)
  const [authed, setAuthed] = useState(false)
  const [profile, setProfile] = useState<ApiProfile | null>(null)
  const [objects, setObjects] = useState<ApiObject[]>([])
  const [folders, setFolders] = useState<string[]>([])
  const [currentFolder, setCurrentFolder] = useState('')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null)
  const [showTrash, setShowTrash] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [buyOpen, setBuyOpen] = useState(false)
  const [newFolderOpen, setNewFolderOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [renameValue, setRenameValue] = useState('')
  const [moveTarget, setMoveTarget] = useState('')
  const [network, setNetwork] = useState<StellarNetworkId>(() => loadPreferredNetwork())
  const [onChain, setOnChain] = useState(false)
  const [contractId, setContractId] = useState(STORAGE_CONTRACT_ID)
  const [apiOnline, setApiOnline] = useState<boolean | null>(null)
  const [apiKeys, setApiKeys] = useState<ApiKeyInfo[]>([])
  const [projects, setProjects] = useState<ApiProject[]>([])
  const [createdKeySecret, setCreatedKeySecret] = useState<string | null>(null)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [versioning, setVersioningState] = useState<VersioningStatus>('Disabled')
  const [versions, setVersions] = useState<ObjectVersion[]>([])
  const [keyName, setKeyName] = useState('server')
  const [keyProjectId, setKeyProjectId] = useState('')
  const [projectName, setProjectName] = useState('app')
  const [projectMaxGb, setProjectMaxGb] = useState('')
  const [passOpen, setPassOpen] = useState(false)
  const [passReason, setPassReason] = useState<'unlock' | 'retry'>('unlock')
  const [mobileClient] = useState(() => isMobileClient())
  const [inAppWallet] = useState(() => isWalletInAppBrowser())
  const wcEnabled = walletConnectConfigured()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const dragDepth = useRef(0)
  const pendingUpload = useRef<{
    entries: Array<{ file: File; relativeFolder?: string }>
    targetFolder: string
  } | null>(null)
  const pendingDownload = useRef<ApiObject | null>(null)

  function clearDragState() {
    dragDepth.current = 0
    setDragging(false)
  }

  useEffect(() => {
    const onEnd = () => clearDragState()
    // Capture phase so folder-row stopPropagation cannot leave the dim overlay stuck.
    window.addEventListener('dragend', onEnd, true)
    window.addEventListener('drop', onEnd, true)
    return () => {
      window.removeEventListener('dragend', onEnd, true)
      window.removeEventListener('drop', onEnd, true)
    }
  }, [])

  const refresh = useCallback(async () => {
    if (!sessionAddress()) {
      setProfile(null)
      setObjects([])
      setFolders([])
      setApiKeys([])
      setAuthed(false)
      return
    }
    const [p, listing, keys, projectList, ver] = await Promise.all([
      getProfile(),
      listVault(showTrash ? { trash: 'only' } : {}),
      listApiKeys().catch(() => []),
      listProjects().catch(() => []),
      getVersioning().catch(() => 'Disabled' as VersioningStatus),
    ])
    setProfile(p)
    setObjects(listing.objects)
    setFolders(listing.folders)
    setApiKeys(keys)
    setProjects(projectList)
    setVersioningState(ver)
    setAuthed(true)
  }, [showTrash])

  useEffect(() => {
    if (!authed) return
    void refresh().catch(() => undefined)
  }, [showTrash, authed, refresh])

  useEffect(() => {
    void (async () => {
      let activeNetwork = network
      try {
        const cfg = await fetchPublicConfig()
        setApiOnline(true)
        setOnChain(cfg.onChain)
        if (cfg.contractId) setContractId(cfg.contractId)
        if (cfg.network === 'public' || cfg.network === 'testnet') {
          activeNetwork = cfg.network
          setNetwork(cfg.network)
        }
      } catch {
        setApiOnline(false)
      }

      const addr = await restoreWallet(activeNetwork)
      setWallet(addr)
      saveAddress(addr)
      if (addr && hasSession(addr)) {
        try {
          await refresh()
        } catch {
          clearSession()
          setAuthed(false)
        }
      } else if (peekWalletConnectPendingAuth()) {
        // Tab may have reloaded while LOBSTR was approving the auth signature.
        void resumeWalletConnectAuth()
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh])

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void resumeWalletConnectAuth()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('pageshow', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('pageshow', onVisible)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed, busy, network])

  useEffect(() => {
    if (!toast) return
    // Keep WalletConnect guidance visible longer — users are switching apps.
    const ms = toast.includes('LOBSTR') || toast.includes('WalletConnect') ? 9000 : 3200
    const t = window.setTimeout(() => setToast(null), ms)
    return () => window.clearTimeout(t)
  }, [toast])

  const crumbs = useMemo(() => breadcrumbs(currentFolder), [currentFolder])
  const topFolders = useMemo(() => childFolders(folders, ''), [folders])
  const searching = query.trim().length > 0

  const rows = useMemo<Row[]>(() => {
    const q = query.trim().toLowerCase()
    if (showTrash || q) {
      return objects
        .filter(
          (o) =>
            !q ||
            o.name.toLowerCase().includes(q) ||
            o.hash.includes(q) ||
            (o.folder || '').toLowerCase().includes(q),
        )
        .map((object) => ({ kind: 'file' as const, object }))
    }

    const folderRows: FolderRow[] = childFolders(folders, currentFolder).map((name) => {
      const path = currentFolder ? `${currentFolder}/${name}` : name
      return {
        kind: 'folder',
        name,
        path,
        count: countUnderFolder(objects, path),
      }
    })
    const fileRows: FileRow[] = objectsInFolder(objects, currentFolder).map((object) => ({
      kind: 'file',
      object,
    }))
    return [
      ...folderRows.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
      ...fileRows.sort((a, b) => a.object.name.localeCompare(b.object.name, undefined, { sensitivity: 'base' })),
    ]
  }, [objects, folders, currentFolder, query, showTrash])

  const selectedObj = objects.find((o) => o.hash === selected) ?? null
  const selectedKey = selectedObj
    ? selectedObj.key ||
      (selectedObj.folder ? `${selectedObj.folder}/${selectedObj.name}` : selectedObj.name)
    : null

  useEffect(() => {
    if (!selectedKey || versioning !== 'Enabled' || showTrash) {
      setVersions([])
      return
    }
    let cancelled = false
    void listObjectVersions(selectedKey)
      .then((rows) => {
        if (!cancelled) setVersions(rows.filter((v) => v.key === selectedKey))
      })
      .catch(() => {
        if (!cancelled) setVersions([])
      })
    return () => {
      cancelled = true
    }
  }, [selectedKey, versioning, showTrash, objects])

  const usage = profile?.usedBytes ?? 0
  const quota = profile?.quotaBytes ?? 0
  const usagePct = quota > 0 ? Math.min(100, (usage / quota) * 100) : 0
  const moveOptions = useMemo(() => ['', ...folders], [folders])

  function navigateTo(path: string) {
    setCurrentFolder(normalizeFolderPath(path))
    setSelected(null)
    setSelectedFolder(null)
    setQuery('')
  }

  function hashExplorerHref(obj: ApiObject): string {
    if (obj.registrationTx) return explorerTxUrl(obj.registrationTx, network)
    return explorerContractUrl(contractId, network)
  }

  function HashLink({
    obj,
    children,
    className,
  }: {
    obj: ApiObject
    children: ReactNode
    className?: string
  }) {
    const href = hashExplorerHref(obj)
    const title = obj.registrationTx
      ? `View registration transaction on Stellar ${network === 'public' ? 'Mainnet' : 'Testnet'} explorer`
      : `View storage contract on Stellar ${network === 'public' ? 'Mainnet' : 'Testnet'} explorer`
    return (
      <a
        className={className ?? 'dash-hash-link'}
        href={href}
        target="_blank"
        rel="noreferrer"
        title={title}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </a>
    )
  }

  async function finishAuth(addr: string) {
    setWallet(addr)
    saveAddress(addr)
    if (isWalletConnectSelected()) {
      setToast(
        'Approve the Evernet sign-in in LOBSTR — stay on ≡ → WalletConnect until it completes, then return here',
      )
    }
    await loginWithWallet(addr, network)
    await refresh()
    setToast('Wallet profile linked on Evernet')
  }

  async function connectAndAuth() {
    setBusy(true)
    try {
      const addr = await connectWallet(network)
      await finishAuth(addr)
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Connect failed')
    } finally {
      setBusy(false)
    }
  }

  /** Resume SEP-10 sign-in if the tab was backgrounded during a WalletConnect approval. */
  async function resumeWalletConnectAuth() {
    if (authed || busy) return
    const pending = peekWalletConnectPendingAuth()
    if (!pending) return
    setBusy(true)
    try {
      const addr = (await restoreWallet(network)) || pending.address
      await finishAuth(addr)
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Could not finish WalletConnect sign-in')
    } finally {
      setBusy(false)
    }
  }

  async function disconnect() {
    clearSession()
    clearVaultPassphrase()
    clearWalletConnectPendingAuth()
    await disconnectWallet()
    saveAddress(null)
    setWallet(null)
    setAuthed(false)
    setProfile(null)
    setObjects([])
    setFolders([])
    setApiKeys([])
    setProjects([])
    setSelected(null)
    setSelectedFolder(null)
    setCurrentFolder('')
    setToast('Disconnected — vault hidden')
  }

  async function runUpload(
    entries: Array<{ file: File; relativeFolder?: string }>,
    targetFolder: string,
    pass: string,
  ) {
    setBusy(true)
    try {
      let uploaded = 0
      for (const entry of entries) {
        const relative = normalizeFolderPath(entry.relativeFolder || '')
        const folder = relative
          ? normalizeFolderPath(targetFolder ? `${targetFolder}/${relative}` : relative)
          : normalizeFolderPath(targetFolder)
        const { ciphertext, header } = await encryptFile(entry.file, pass)
        await uploadObject(ciphertext, {
          name: header.name,
          mimeType: 'application/octet-stream',
          encrypted: true,
          folder,
        })
        uploaded += 1
      }
      await refresh()
      setToast(
        uploaded === 1
          ? `Uploaded into ${targetFolder || 'Vault'}`
          : `Uploaded ${uploaded} encrypted files`,
      )
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleUpload(
    fileList: Array<{ file: File; relativeFolder?: string }> | FileList | File[],
    targetFolder = currentFolder,
  ) {
    if (!authed || !wallet) {
      setToast('Connect a Stellar wallet to upload')
      return
    }
    const entries = Array.isArray(fileList)
      ? fileList.map((f) => ('file' in f ? f : { file: f as File, relativeFolder: '' }))
      : Array.from(fileList).map((file) => ({ file, relativeFolder: '' }))

    const pass = resolveVaultPassphrase(wallet)
    if (!pass) {
      pendingUpload.current = { entries, targetFolder }
      pendingDownload.current = null
      setPassReason('unlock')
      setPassOpen(true)
      return
    }
    await runUpload(entries, targetFolder, pass)
  }

  async function runDownload(obj: ApiObject, pass: string) {
    setBusy(true)
    try {
      const blob = await downloadObject(obj.hash)
      let out: Blob = blob
      let name = obj.name
      if (obj.encrypted) {
        try {
          const dec = await decryptBlob(blob, pass)
          out = dec.file
          name = dec.name
        } catch {
          pendingDownload.current = obj
          pendingUpload.current = null
          setPassReason('retry')
          setPassOpen(true)
          return
        }
      }
      const url = URL.createObjectURL(out)
      const a = document.createElement('a')
      a.href = url
      a.download = name
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Download failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleDownload(obj: ApiObject) {
    if (!wallet) return
    const pass = resolveVaultPassphrase(wallet)
    if (!pass && obj.encrypted) {
      pendingDownload.current = obj
      pendingUpload.current = null
      setPassReason('unlock')
      setPassOpen(true)
      return
    }
    await runDownload(obj, pass || '')
  }

  function onPassphraseUnlocked(pass: string) {
    setPassOpen(false)
    const upload = pendingUpload.current
    const download = pendingDownload.current
    pendingUpload.current = null
    pendingDownload.current = null
    if (upload) void runUpload(upload.entries, upload.targetFolder, pass)
    else if (download) void runDownload(download, pass)
  }

  async function handleDelete(hash: string, permanent = false) {
    setBusy(true)
    try {
      const res = await deleteObject(hash, { permanent: permanent || showTrash })
      if (selected === hash) setSelected(null)
      await refresh()
      setToast(
        res.permanent || permanent || showTrash
          ? 'Object permanently deleted'
          : 'Moved to trash · restore within 30 days',
      )
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleRestore(hash: string) {
    setBusy(true)
    try {
      await restoreObject(hash)
      if (selected === hash) setSelected(null)
      await refresh()
      setToast('Object restored')
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Restore failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleToggleVersioning() {
    setBusy(true)
    try {
      const next = versioning === 'Enabled' ? 'Disabled' : 'Enabled'
      const status = await setVersioning(next)
      setVersioningState(status)
      setToast(
        status === 'Enabled'
          ? 'Versioning enabled · overwrites keep prior versions (quota applies)'
          : 'Versioning disabled · overwrites replace the current object',
      )
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Could not update versioning')
    } finally {
      setBusy(false)
    }
  }

  async function handleRestoreVersion(versionId: string) {
    if (!selectedKey) return
    setBusy(true)
    try {
      await restoreObjectVersion(selectedKey, versionId)
      await refresh()
      setToast('Version restored as latest')
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Restore version failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleDeleteVersion(versionId: string) {
    if (!selectedKey) return
    if (!window.confirm('Permanently delete this version?')) return
    setBusy(true)
    try {
      await deleteObjectVersion(selectedKey, versionId)
      await refresh()
      setToast('Version deleted')
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Delete version failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleCreateApiKey() {
    setBusy(true)
    try {
      const created = await createApiKey(keyName.trim() || 'server', keyProjectId || undefined)
      setCreatedKeySecret(created.key)
      setApiKeys(await listApiKeys())
      setToast('API key created — copy it now; it won’t be shown again')
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Could not create API key')
    } finally {
      setBusy(false)
    }
  }

  async function handleRevokeApiKey(id: string) {
    setBusy(true)
    try {
      await revokeApiKey(id)
      setApiKeys(await listApiKeys())
      setToast('API key revoked')
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Revoke failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleCreateProject() {
    setBusy(true)
    try {
      const maxBytes = projectMaxGb.trim()
        ? Math.floor(Number(projectMaxGb) * 1024 * 1024 * 1024)
        : null
      await createProject({ name: projectName.trim() || 'app', maxBytes })
      setProjects(await listProjects())
      setProjectName('app')
      setProjectMaxGb('')
      setToast('Project pool created')
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Could not create project')
    } finally {
      setBusy(false)
    }
  }

  async function handleArchiveProject(id: string) {
    setBusy(true)
    try {
      await archiveProject(id)
      setProjects(await listProjects())
      if (keyProjectId === id) setKeyProjectId('')
      setToast('Project archived')
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Archive failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleShareObject(obj: ApiObject) {
    setBusy(true)
    try {
      const grant = await createShareGrant({
        hash: obj.hash,
        expiresInSec: 7 * 24 * 3600,
      })
      setShareUrl(grant.url)
      setToast('Share link created — anyone with the URL can download ciphertext for 7 days')
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Could not create share link')
    } finally {
      setBusy(false)
    }
  }

  async function handleCreateFolder() {
    setBusy(true)
    try {
      const path = joinFolder(currentFolder, newFolderName)
      const next = await createFolder(path)
      setFolders(next)
      setNewFolderOpen(false)
      setNewFolderName('')
      setToast(`Created ${path}`)
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Could not create folder')
    } finally {
      setBusy(false)
    }
  }

  async function handleRenameFolder(path: string) {
    const name = renameValue.trim()
    if (!name) return
    setBusy(true)
    try {
      const to = joinFolder(parentFolder(path), name)
      const result = await renameFolder(path, to)
      setFolders(result.folders)
      if (currentFolder === path || currentFolder.startsWith(`${path}/`)) {
        setCurrentFolder(
          currentFolder === path ? to : `${to}${currentFolder.slice(path.length)}`,
        )
      }
      setSelectedFolder(to)
      setRenameValue('')
      await refresh()
      setToast(result.moved ? `Renamed · ${result.moved} items updated` : 'Folder renamed')
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Rename failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleDeleteFolder(path: string, recursive: boolean) {
    const label = path.split('/').pop() || path
    const count = countUnderFolder(objects, path)
    const ok = window.confirm(
      recursive || count === 0
        ? `Delete folder “${label}”${count ? ` and its ${count} file(s)` : ''}?`
        : `Folder “${label}” still has ${count} file(s). Delete the folder and everything inside?`,
    )
    if (!ok) return
    setBusy(true)
    try {
      const result = await deleteFolder(path, recursive || count > 0)
      setFolders(result.folders)
      if (currentFolder === path || currentFolder.startsWith(`${path}/`)) {
        navigateTo(parentFolder(path))
      }
      setSelectedFolder(null)
      await refresh()
      setToast(
        count > 0 || recursive
          ? 'Folder removed · files moved to trash (30 days)'
          : 'Folder deleted',
      )
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Delete folder failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleMoveObject(hash: string, folder: string) {
    setBusy(true)
    try {
      const result = await updateObject(hash, { folder: normalizeFolderPath(folder) })
      setFolders(result.folders)
      await refresh()
      setToast(folder ? `Moved to ${folder}` : 'Moved to Vault root')
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Move failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleRenameObject(hash: string, name: string) {
    if (!name.trim()) return
    setBusy(true)
    try {
      await updateObject(hash, { name: name.trim() })
      await refresh()
      setToast('Renamed')
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Rename failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="dash" onClick={() => setMenuOpen(false)}>
      <aside className={`dash-sidebar ${menuOpen ? 'open' : ''}`} onClick={(e) => e.stopPropagation()}>
        <Link to="/" className="dash-brand">
          Evernet
        </Link>
        <p className="dash-side-label">Wallet vault</p>
        <nav className="dash-nav" aria-label="Vault">
          <button
            type="button"
            className={`dash-nav-btn ${currentFolder === '' && !searching ? 'active' : ''}`}
            onClick={() => navigateTo('')}
          >
            All files
          </button>
          <button type="button" className="dash-nav-btn" onClick={() => setBuyOpen(true)}>
            Buy storage
          </button>
          <Link to="/docs" className="dash-nav-btn">
            Docs
          </Link>
        </nav>

        {authed && topFolders.length > 0 && (
          <div className="dash-folder-tree">
            <p className="dash-side-label">Folders</p>
            <ul>
              {topFolders.map((name) => {
                const path = name
                const active =
                  currentFolder === path || currentFolder.startsWith(`${path}/`)
                return (
                  <li key={path}>
                    <button
                      type="button"
                      className={`dash-folder-link ${active ? 'active' : ''}`}
                      onClick={() => navigateTo(path)}
                    >
                      <Icon kind="folder" />
                      <span>{name}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        <div className="dash-quota">
          <div className="dash-quota-top">
            <span>Storage</span>
            <span>
              {formatBytes(usage)} / {formatBytes(quota || 0)}
            </span>
          </div>
          <div className="dash-quota-track">
            <div className="dash-quota-fill" style={{ width: `${usagePct}%` }} />
          </div>
          <p className="dash-quota-note">
            {profile
              ? `${profile.source === 'soroban' ? 'Soroban profile' : 'API mirror'} · ${profile.objectCount} objects`
              : 'Connect wallet to load on-chain quota'}
          </p>
          <button type="button" className="dash-btn primary dash-buy-btn" onClick={() => setBuyOpen(true)}>
            Buy storage
          </button>
        </div>

        <div className="dash-network">
          <span className="dash-pulse" aria-hidden="true" />
          <div>
            <strong>Stellar {network === 'public' ? 'Mainnet' : 'Testnet'}</strong>
            <p>
              {wallet ? (
                <>
                  {shortenAddress(wallet)}
                  {authed ? ' · session live' : ' · sign in to vault'}
                </>
              ) : (
                'No wallet connected'
              )}
            </p>
            <p style={{ marginTop: '0.35rem' }}>
              API {apiOnline === null ? '…' : apiOnline ? 'online' : 'offline'}
              {onChain ? ' · contract linked' : ''}
            </p>
          </div>
        </div>
      </aside>

      <div className="dash-main">
        <header className="dash-top">
          <button
            type="button"
            className="dash-menu-btn"
            aria-label="Open menu"
            onClick={(e) => {
              e.stopPropagation()
              setMenuOpen((v) => !v)
            }}
          >
            Menu
          </button>
          <div className="dash-crumbs" aria-label="Breadcrumb">
            {authed ? (
              crumbs.map((crumb, i) => {
                const last = i === crumbs.length - 1
                return (
                  <span key={`${crumb.path}-${i}`} className="dash-crumb-wrap">
                    {i > 0 && <span className="dash-crumb-sep">/</span>}
                    {last ? (
                      <span className="dash-crumb current">{crumb.label}</span>
                    ) : (
                      <button type="button" className="dash-crumb" onClick={() => navigateTo(crumb.path)}>
                        {crumb.label}
                      </button>
                    )}
                  </span>
                )
              })
            ) : (
              <span className="dash-crumb current">Connect a wallet to open your vault</span>
            )}
          </div>
          <div className="dash-top-actions">
            {authed && (
              <label className="dash-search">
                <span className="sr-only">Search files</span>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search vault…"
                  type="search"
                />
              </label>
            )}
            {!authed ? (
              <button type="button" className="dash-btn primary" disabled={busy} onClick={() => void connectAndAuth()}>
                {busy ? 'Connecting…' : 'Connect wallet'}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className={`dash-btn ghost${showTrash ? ' active' : ''}`}
                  disabled={busy}
                  onClick={() => {
                    setShowTrash((v) => !v)
                    setSelected(null)
                    setSelectedFolder(null)
                    setQuery('')
                  }}
                  title="Soft-deleted objects (30-day retention)"
                >
                  {showTrash ? 'Exit trash' : 'Trash'}
                </button>
                {!showTrash && (
                  <button
                    type="button"
                    className="dash-btn ghost"
                    disabled={busy}
                    onClick={() => {
                      setNewFolderName('')
                      setNewFolderOpen(true)
                    }}
                  >
                    New folder
                  </button>
                )}
                {!showTrash && (
                  <button
                    type="button"
                    className="dash-btn ghost"
                    disabled={busy}
                    onClick={() => folderInputRef.current?.click()}
                    title="Upload a folder from your computer"
                  >
                    Upload folder
                  </button>
                )}
                {!showTrash && (
                  <button
                    type="button"
                    className="dash-btn primary"
                    disabled={busy}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Upload
                  </button>
                )}
                <button type="button" className="dash-btn ghost" onClick={() => void openWalletProfile()}>
                  Wallet
                </button>
                <button type="button" className="dash-btn ghost" onClick={() => void disconnect()}>
                  Disconnect
                </button>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files) void handleUpload(e.target.files)
                e.target.value = ''
              }}
            />
            <input
              ref={folderInputRef}
              type="file"
              multiple
              hidden
              {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
              onChange={(e) => {
                if (!e.target.files) return
                const entries = Array.from(e.target.files).map((file) => {
                  const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
                  const parts = rel.replace(/\\/g, '/').split('/')
                  parts.pop()
                  return { file, relativeFolder: parts.join('/') }
                })
                void handleUpload(entries)
                e.target.value = ''
              }}
            />
          </div>
        </header>

        <div
          className={`dash-body ${dragging ? 'dragging' : ''}`}
          onDragEnter={(e) => {
            e.preventDefault()
            dragDepth.current += 1
            setDragging(true)
          }}
          onDragOver={(e) => e.preventDefault()}
          onDragLeave={(e) => {
            e.preventDefault()
            dragDepth.current -= 1
            if (dragDepth.current <= 0) clearDragState()
          }}
          onDrop={(e) => {
            e.preventDefault()
            clearDragState()
            void (async () => {
              const dropped = await filesFromDataTransfer(e.dataTransfer)
              if (dropped.length) await handleUpload(dropped)
            })()
          }}
        >
          <div className="dash-panel">
            {!authed ? (
              <div className="dash-empty">
                <h2>Your storage is tied to your Stellar wallet</h2>
                <p>
                  {mobileClient && !inAppWallet
                    ? 'On a phone browser, extension wallets like Freighter desktop are not available. Connect with LOBSTR, Albedo, or xBull — or open evernet.tech inside your wallet’s in-app browser.'
                    : 'Connect Freighter, LOBSTR, xBull, Albedo, Hana, Rabet or any other supported Stellar wallet to load the Soroban storage profile for that address. Files are encrypted in-browser, stored on the Evernet API, and registered on-chain.'}
                </p>
                <button type="button" className="dash-btn primary" disabled={busy} onClick={() => void connectAndAuth()}>
                  {busy ? 'Connecting…' : 'Connect wallet'}
                </button>
                <p className="dash-empty-hint">
                  {inAppWallet
                    ? 'Wallet in-app browser detected — pick your installed wallet in the connect dialog.'
                    : mobileClient
                      ? wcEnabled
                        ? 'Prefer LOBSTR / Albedo / xBull, or scan with WalletConnect from the dialog.'
                        : 'Best path: open this site in LOBSTR, Freighter, or xBull. WalletConnect QR is not configured on this deploy yet.'
                      : 'On a phone? Open evernet.tech inside your wallet’s in-app browser, or pick LOBSTR / xBull / Albedo in the connect dialog.'}
                </p>
                {apiOnline === false && (
                  <p className="dash-empty-error">
                    Storage API unreachable at {apiBase()}. It may be redeploying — retry in a moment.
                  </p>
                )}
              </div>
            ) : rows.length === 0 ? (
              <div className="dash-empty">
                <h2>
                  {showTrash
                    ? 'Trash is empty'
                    : searching
                      ? 'No matches'
                      : currentFolder
                        ? 'This folder is empty'
                        : 'Drop files or folders to encrypt & store'}
                </h2>
                <p>
                  {showTrash
                    ? 'Deleted files stay here for 30 days, then are purged permanently.'
                    : searching
                      ? 'Try another name, hash, or folder path.'
                      : `Uploads land in ${currentFolder || 'Vault'}. Create folders to keep credentials, media, and archives apart.`}
                </p>
                {!searching && !showTrash && (
                  <div className="dash-empty-actions">
                    <button type="button" className="dash-btn primary" onClick={() => fileInputRef.current?.click()}>
                      Upload files
                    </button>
                    <button
                      type="button"
                      className="dash-btn ghost"
                      onClick={() => {
                        setNewFolderName('')
                        setNewFolderOpen(true)
                      }}
                    >
                      New folder
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="dash-table-wrap">
                <table className="dash-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Size</th>
                      <th>{searching ? 'Location' : 'Shards'}</th>
                      <th>Modified</th>
                      <th aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {!searching && currentFolder !== '' && (
                      <tr className="dash-up-row" onDoubleClick={() => navigateTo(parentFolder(currentFolder))}>
                        <td colSpan={5}>
                          <button
                            type="button"
                            className="dash-up-btn"
                            onClick={() => navigateTo(parentFolder(currentFolder))}
                          >
                            ← Up to {parentFolder(currentFolder) || 'Vault'}
                          </button>
                        </td>
                      </tr>
                    )}
                    {rows.map((row) => {
                      if (row.kind === 'folder') {
                        return (
                          <tr
                            key={`folder:${row.path}`}
                            className={selectedFolder === row.path ? 'selected' : ''}
                              onClick={() => {
                              setSelectedFolder(row.path)
                              setSelected(null)
                              setShareUrl(null)
                              setRenameValue(row.name)
                            }}
                            onDoubleClick={() => navigateTo(row.path)}
                            onDragOver={(e) => {
                              e.preventDefault()
                              e.dataTransfer.dropEffect = e.dataTransfer.types.includes(
                                'text/evernet-hash',
                              )
                                ? 'move'
                                : 'copy'
                            }}
                            onDrop={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              clearDragState()
                              const hash = e.dataTransfer.getData('text/evernet-hash')
                              if (hash) {
                                void handleMoveObject(hash, row.path)
                                return
                              }
                              void (async () => {
                                const dropped = await filesFromDataTransfer(e.dataTransfer)
                                if (dropped.length) await handleUpload(dropped, row.path)
                              })()
                            }}
                          >
                            <td>
                              <div className="dash-name">
                                <span className="dash-file-icon kind-folder">
                                  <Icon kind="folder" />
                                </span>
                                <span>
                                  <strong>{row.name}</strong>
                                  <small>
                                    {row.count} item{row.count === 1 ? '' : 's'} · double-click to open
                                  </small>
                                </span>
                              </div>
                            </td>
                            <td>—</td>
                            <td>—</td>
                            <td>—</td>
                            <td className="dash-row-actions" onClick={(e) => e.stopPropagation()}>
                              <button type="button" onClick={() => navigateTo(row.path)}>
                                Open
                              </button>
                              <button
                                type="button"
                                className="danger"
                                disabled={busy}
                                onClick={() => void handleDeleteFolder(row.path, false)}
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        )
                      }

                      const item = row.object
                      const iconKind = fileIconKind(item.mimeType, item.name)
                      return (
                        <tr
                          key={item.hash}
                          className={selected === item.hash ? 'selected' : ''}
                          onClick={() => {
                            setSelected(item.hash)
                            setShareUrl(null)
                            setSelectedFolder(null)
                            setRenameValue(item.name)
                            setMoveTarget(item.folder || '')
                          }}
                          onDragStart={(e) => {
                            e.dataTransfer.setData('text/evernet-hash', item.hash)
                            e.dataTransfer.effectAllowed = 'move'
                          }}
                          draggable
                        >
                          <td>
                            <div className="dash-name">
                              <span className={`dash-file-icon kind-${iconKind}`}>
                                <Icon kind={iconKind} />
                              </span>
                              <span>
                                <strong>{item.name}</strong>
                                <small>
                                  {item.encrypted ? 'Encrypted' : 'Plain'} ·{' '}
                                  <HashLink obj={item}>{item.hash.slice(0, 10)}…</HashLink>
                                </small>
                              </span>
                            </div>
                          </td>
                          <td>{formatBytes(item.size)}</td>
                          <td>{searching ? item.folder || 'Vault' : item.shards}</td>
                          <td>{formatDate(item.createdAt)}</td>
                          <td className="dash-row-actions" onClick={(e) => e.stopPropagation()}>
                            {searching && item.folder && (
                              <button type="button" onClick={() => navigateTo(item.folder)}>
                                Go to folder
                              </button>
                            )}
                            {!showTrash && (
                              <button type="button" disabled={busy} onClick={() => void handleDownload(item)}>
                                Download
                              </button>
                            )}
                            {showTrash ? (
                              <>
                                <button type="button" disabled={busy} onClick={() => void handleRestore(item.hash)}>
                                  Restore
                                </button>
                                <button
                                  type="button"
                                  className="danger"
                                  disabled={busy}
                                  onClick={() => void handleDelete(item.hash, true)}
                                >
                                  Delete forever
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                className="danger"
                                disabled={busy}
                                onClick={() => void handleDelete(item.hash)}
                              >
                                Delete
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <aside className="dash-detail" aria-label="Details">
            {selectedObj ? (
              <>
                <p className="dash-detail-label">Object</p>
                <h2>{selectedObj.name}</h2>
                <dl className="dash-meta">
                  <div>
                    <dt>Location</dt>
                    <dd>
                      <button
                        type="button"
                        className="dash-hash-link"
                        onClick={() => navigateTo(selectedObj.folder || '')}
                      >
                        {selectedObj.folder || 'Vault'}
                      </button>
                    </dd>
                  </div>
                  <div>
                    <dt>Content hash</dt>
                    <dd style={{ wordBreak: 'break-all', fontSize: '0.8rem' }}>
                      <HashLink obj={selectedObj}>{selectedObj.hash}</HashLink>
                    </dd>
                  </div>
                  {selectedObj.registrationTx && (
                    <div>
                      <dt>Registration tx</dt>
                      <dd style={{ wordBreak: 'break-all', fontSize: '0.8rem' }}>
                        <a
                          className="dash-hash-link"
                          href={explorerTxUrl(selectedObj.registrationTx, network)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {selectedObj.registrationTx}
                        </a>
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt>Size</dt>
                    <dd>{formatBytes(selectedObj.size)}</dd>
                  </div>
                  <div>
                    <dt>Encryption</dt>
                    <dd>{selectedObj.encrypted ? 'AES-GCM · client-side' : 'Off'}</dd>
                  </div>
                </dl>

                <div className="dash-detail-form">
                  <label>
                    Rename
                    <input
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void handleRenameObject(selectedObj.hash, renameValue)
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    className="dash-btn ghost"
                    disabled={busy || !renameValue.trim() || renameValue.trim() === selectedObj.name}
                    onClick={() => void handleRenameObject(selectedObj.hash, renameValue)}
                  >
                    Save name
                  </button>
                  <label>
                    Move to
                    <select value={moveTarget} onChange={(e) => setMoveTarget(e.target.value)}>
                      <option value="">Vault</option>
                      {moveOptions
                        .filter(Boolean)
                        .map((folder) => (
                          <option key={folder} value={folder}>
                            {folder}
                          </option>
                        ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="dash-btn primary"
                    disabled={busy || normalizeFolderPath(moveTarget) === (selectedObj.folder || '')}
                    onClick={() => void handleMoveObject(selectedObj.hash, moveTarget)}
                  >
                    Move
                  </button>
                  {!showTrash && (
                    <button
                      type="button"
                      className="dash-btn ghost"
                      disabled={busy}
                      onClick={() => void handleShareObject(selectedObj)}
                    >
                      Create share link
                    </button>
                  )}
                  {showTrash ? (
                    <>
                      <button
                        type="button"
                        className="dash-btn primary"
                        disabled={busy}
                        onClick={() => void handleRestore(selectedObj.hash)}
                      >
                        Restore
                      </button>
                      <button
                        type="button"
                        className="dash-btn ghost danger"
                        disabled={busy}
                        onClick={() => void handleDelete(selectedObj.hash, true)}
                      >
                        Delete forever
                      </button>
                    </>
                  ) : null}
                  {shareUrl && !showTrash && (
                    <label>
                      Share URL (ciphertext · 7 days)
                      <input readOnly value={shareUrl} onFocus={(e) => e.target.select()} />
                    </label>
                  )}
                  {!showTrash && (
                    <div className="dash-versions">
                      <div className="dash-versions-head">
                        <p className="dash-detail-label">Versions</p>
                        <button
                          type="button"
                          className="dash-btn ghost"
                          disabled={busy}
                          onClick={() => void handleToggleVersioning()}
                        >
                          {versioning === 'Enabled' ? 'Disable versioning' : 'Enable versioning'}
                        </button>
                      </div>
                      {versioning !== 'Enabled' ? (
                        <p className="dash-empty-hint">
                          Off by default. When enabled, overwrites keep prior versions (they count against quota).
                          Lifecycle rules via API: <code>PUT /s3/v1/lifecycle</code>.
                        </p>
                      ) : versions.length === 0 ? (
                        <p className="dash-empty-hint">No prior versions for this key yet.</p>
                      ) : (
                        <ul className="dash-version-list">
                          {versions.map((v) => (
                            <li key={v.versionId}>
                              <div>
                                <code>{v.versionId.slice(0, 12)}…</code>
                                {v.isLatest ? ' · latest' : ''}
                                {v.isDeleteMarker ? ' · delete marker' : ` · ${formatBytes(v.size)}`}
                                <span className="dash-version-date">
                                  {' '}
                                  {formatDate(v.lastModified)}
                                </span>
                              </div>
                              <div className="dash-row-actions">
                                {!v.isDeleteMarker && !v.isLatest && (
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => void handleRestoreVersion(v.versionId)}
                                  >
                                    Restore
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className="danger"
                                  disabled={busy}
                                  onClick={() => void handleDeleteVersion(v.versionId)}
                                >
                                  Delete
                                </button>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              </>
            ) : selectedFolder ? (
              <>
                <p className="dash-detail-label">Folder</p>
                <h2>{selectedFolder.split('/').pop()}</h2>
                <dl className="dash-meta">
                  <div>
                    <dt>Path</dt>
                    <dd>{selectedFolder}</dd>
                  </div>
                  <div>
                    <dt>Items</dt>
                    <dd>{countUnderFolder(objects, selectedFolder)}</dd>
                  </div>
                </dl>
                <div className="dash-detail-form">
                  <label>
                    Rename folder
                    <input
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void handleRenameFolder(selectedFolder)
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    className="dash-btn ghost"
                    disabled={busy || !renameValue.trim()}
                    onClick={() => void handleRenameFolder(selectedFolder)}
                  >
                    Save name
                  </button>
                  <button
                    type="button"
                    className="dash-btn primary"
                    onClick={() => navigateTo(selectedFolder)}
                  >
                    Open folder
                  </button>
                  <button
                    type="button"
                    className="dash-btn ghost"
                    disabled={busy}
                    onClick={() => void handleDeleteFolder(selectedFolder, true)}
                  >
                    Delete folder
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="dash-detail-label">Protocol</p>
                <h2>{currentFolder ? currentFolder.split('/').pop() : 'Wallet-linked storage'}</h2>
                <p className="dash-detail-copy">
                  {currentFolder
                    ? `New uploads land in this folder. Drag files onto the panel, or use Upload folder to keep a local directory tree.`
                    : 'Quota and object registrations live on Soroban. Encrypted bytes live on the Evernet API. Folders are organization metadata — they are not stored on-chain.'}
                </p>
                <ul className="dash-detail-list">
                  <li>Identity = Stellar address</li>
                  <li>Folders organize ciphertext off-chain</li>
                  <li>Content hashes stay on Soroban</li>
                  <li>Contract: {shortenAddress(contractId)}</li>
                </ul>
                <button
                  type="button"
                  className="dash-btn primary"
                  style={{ marginTop: '1rem' }}
                  onClick={() => setBuyOpen(true)}
                >
                  Buy storage with XLM
                </button>

                {authed && (
                  <div className="dash-detail-form" style={{ marginTop: '1.5rem' }}>
                    <p className="dash-detail-label">Project pools</p>
                    <p className="dash-detail-copy">
                      Soft caps inside this wallet’s quota. Bind API keys to a project to meter app usage — see{' '}
                      <Link to="/docs#projects">docs</Link>.
                    </p>
                    <label>
                      Project name
                      <input value={projectName} onChange={(e) => setProjectName(e.target.value)} />
                    </label>
                    <label>
                      Soft cap (GB, optional)
                      <input
                        value={projectMaxGb}
                        onChange={(e) => setProjectMaxGb(e.target.value)}
                        placeholder="e.g. 2"
                        inputMode="decimal"
                      />
                    </label>
                    <button
                      type="button"
                      className="dash-btn ghost"
                      disabled={busy}
                      onClick={() => void handleCreateProject()}
                    >
                      Create project
                    </button>
                    {projects.length > 0 && (
                      <ul className="dash-detail-list">
                        {projects.map((p) => (
                          <li key={p.id}>
                            {p.name} · {formatBytes(p.usedBytes)}
                            {p.maxBytes != null ? ` / ${formatBytes(p.maxBytes)}` : ''}{' '}
                            <button
                              type="button"
                              className="dash-hash-link"
                              disabled={busy}
                              onClick={() => void handleArchiveProject(p.id)}
                            >
                              Archive
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}

                    <p className="dash-detail-label" style={{ marginTop: '1.25rem' }}>
                      Developer API keys
                    </p>
                    <p className="dash-detail-copy">
                      For server agents. Optional project binding enforces the pool cap.
                    </p>
                    {createdKeySecret && (
                      <label>
                        New key (copy now)
                        <input readOnly value={createdKeySecret} onFocus={(e) => e.target.select()} />
                      </label>
                    )}
                    <label>
                      Key name
                      <input value={keyName} onChange={(e) => setKeyName(e.target.value)} placeholder="server" />
                    </label>
                    <label>
                      Project
                      <select value={keyProjectId} onChange={(e) => setKeyProjectId(e.target.value)}>
                        <option value="">Wallet pool (no project)</option>
                        {projects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      className="dash-btn ghost"
                      disabled={busy}
                      onClick={() => void handleCreateApiKey()}
                    >
                      Create API key
                    </button>
                    {apiKeys.length > 0 && (
                      <ul className="dash-detail-list">
                        {apiKeys.map((k) => (
                          <li key={k.id}>
                            <code>{k.prefix}…</code> · {k.name}
                            {k.projectId ? ` · project ${k.projectId.slice(0, 6)}` : ''}{' '}
                            <button
                              type="button"
                              className="dash-hash-link"
                              disabled={busy}
                              onClick={() => void handleRevokeApiKey(k.id)}
                            >
                              Revoke
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </>
            )}
          </aside>

          {dragging && authed && (
            <div className="dash-drop-overlay">
              <p>Drop to encrypt & upload{currentFolder ? ` into ${currentFolder}` : ''}</p>
            </div>
          )}
        </div>
      </div>

      {newFolderOpen && (
        <div className="pay-overlay" role="dialog" aria-modal="true" aria-labelledby="folder-title">
          <button type="button" className="pay-backdrop" aria-label="Close" onClick={() => setNewFolderOpen(false)} />
          <div className="pay-modal dash-folder-modal">
            <header className="pay-head">
              <div>
                <p className="pay-eyebrow">Organize</p>
                <h2 id="folder-title">New folder</h2>
              </div>
              <button type="button" className="pay-close" onClick={() => setNewFolderOpen(false)}>
                Close
              </button>
            </header>
            <p className="pay-lead">
              Created inside <strong>{currentFolder || 'Vault'}</strong>. Folder names stay on the Evernet API — only
              content hashes are registered on Stellar.
            </p>
            <label className="dash-folder-field">
              Name
              <input
                autoFocus
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleCreateFolder()
                }}
                placeholder="e.g. Credentials"
              />
            </label>
            <button
              type="button"
              className="dash-btn primary pay-cta"
              disabled={busy || !newFolderName.trim()}
              onClick={() => void handleCreateFolder()}
            >
              Create folder
            </button>
          </div>
        </div>
      )}

      <BuyStorageModal
        open={buyOpen}
        wallet={wallet}
        onClose={() => setBuyOpen(false)}
        onPurchased={() => {
          void refresh()
        }}
        showToast={setToast}
      />

      {wallet && (
        <PassphraseModal
          open={passOpen}
          address={wallet}
          reason={passReason}
          onClose={() => {
            setPassOpen(false)
            pendingUpload.current = null
            pendingDownload.current = null
          }}
          onUnlocked={onPassphraseUnlocked}
        />
      )}

      {toast && (
        <div className="dash-toast" role="status">
          {toast}
        </div>
      )}
    </div>
  )
}
