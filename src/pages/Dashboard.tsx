import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { BuyStorageModal } from '../components/dashboard/BuyStorageModal'
import {
  type ApiObject,
  type ApiProfile,
  apiBase,
  clearSession,
  createFolder,
  deleteFolder,
  deleteObject,
  downloadObject,
  fetchPublicConfig,
  getProfile,
  hasSession,
  listVault,
  loginWithWallet,
  renameFolder,
  sessionAddress,
  updateObject,
  uploadObject,
} from '../lib/api'
import { decryptBlob, encryptFile, walletPassphrase } from '../lib/crypto'
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
  connectWallet,
  disconnectWallet,
  openWalletProfile,
  restoreWallet,
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
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const dragDepth = useRef(0)

  const refresh = useCallback(async () => {
    if (!sessionAddress()) {
      setProfile(null)
      setObjects([])
      setFolders([])
      setAuthed(false)
      return
    }
    const [p, listing] = await Promise.all([getProfile(), listVault()])
    setProfile(p)
    setObjects(listing.objects)
    setFolders(listing.folders)
    setAuthed(true)
  }, [])

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
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh])

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 3200)
    return () => window.clearTimeout(t)
  }, [toast])

  const crumbs = useMemo(() => breadcrumbs(currentFolder), [currentFolder])
  const topFolders = useMemo(() => childFolders(folders, ''), [folders])
  const searching = query.trim().length > 0

  const rows = useMemo<Row[]>(() => {
    const q = query.trim().toLowerCase()
    if (q) {
      return objects
        .filter(
          (o) =>
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
  }, [objects, folders, currentFolder, query])

  const selectedObj = objects.find((o) => o.hash === selected) ?? null
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

  async function connectAndAuth() {
    setBusy(true)
    try {
      const addr = await connectWallet(network)
      setWallet(addr)
      saveAddress(addr)
      await loginWithWallet(addr, network)
      await refresh()
      setToast('Wallet profile linked on Evernet')
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Connect failed')
    } finally {
      setBusy(false)
    }
  }

  async function disconnect() {
    clearSession()
    await disconnectWallet()
    saveAddress(null)
    setWallet(null)
    setAuthed(false)
    setProfile(null)
    setObjects([])
    setFolders([])
    setSelected(null)
    setSelectedFolder(null)
    setCurrentFolder('')
    setToast('Disconnected — vault hidden')
  }

  async function handleUpload(
    fileList: Array<{ file: File; relativeFolder?: string }> | FileList | File[],
  ) {
    if (!authed || !wallet) {
      setToast('Connect a Stellar wallet to upload')
      return
    }
    const entries = Array.isArray(fileList)
      ? fileList.map((f) => ('file' in f ? f : { file: f as File, relativeFolder: '' }))
      : Array.from(fileList).map((file) => ({ file, relativeFolder: '' }))

    setBusy(true)
    try {
      const pass = walletPassphrase(wallet)
      let uploaded = 0
      for (const entry of entries) {
        const relative = normalizeFolderPath(entry.relativeFolder || '')
        const folder = relative
          ? normalizeFolderPath(currentFolder ? `${currentFolder}/${relative}` : relative)
          : currentFolder
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
          ? `Uploaded into ${currentFolder || 'Vault'}`
          : `Uploaded ${uploaded} encrypted files`,
      )
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleDownload(obj: ApiObject) {
    if (!wallet) return
    setBusy(true)
    try {
      const blob = await downloadObject(obj.hash)
      let out: Blob = blob
      let name = obj.name
      if (obj.encrypted) {
        const dec = await decryptBlob(blob, walletPassphrase(wallet))
        out = dec.file
        name = dec.name
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

  async function handleDelete(hash: string) {
    setBusy(true)
    try {
      await deleteObject(hash)
      if (selected === hash) setSelected(null)
      await refresh()
      setToast('Object deleted · quota freed')
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Delete failed')
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
      setToast('Folder deleted')
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
                  className="dash-btn ghost"
                  disabled={busy}
                  onClick={() => {
                    setNewFolderName('')
                    setNewFolderOpen(true)
                  }}
                >
                  New folder
                </button>
                <button
                  type="button"
                  className="dash-btn ghost"
                  disabled={busy}
                  onClick={() => folderInputRef.current?.click()}
                  title="Upload a folder from your computer"
                >
                  Upload folder
                </button>
                <button
                  type="button"
                  className="dash-btn primary"
                  disabled={busy}
                  onClick={() => fileInputRef.current?.click()}
                >
                  Upload
                </button>
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
            if (dragDepth.current <= 0) {
              dragDepth.current = 0
              setDragging(false)
            }
          }}
          onDrop={(e) => {
            e.preventDefault()
            dragDepth.current = 0
            setDragging(false)
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
                  Connect Freighter, LOBSTR, xBull, Albedo, Hana, Rabet or any other supported Stellar wallet to load the
                  Soroban storage profile for that address. Files are encrypted in-browser, stored on the Evernet API,
                  and registered on-chain.
                </p>
                <button type="button" className="dash-btn primary" disabled={busy} onClick={() => void connectAndAuth()}>
                  {busy ? 'Connecting…' : 'Connect wallet'}
                </button>
                <p className="dash-empty-hint">
                  On a phone? Open evernet.tech inside your wallet’s in-app browser, or pick LOBSTR / xBull in the
                  connect dialog.
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
                  {searching
                    ? 'No matches'
                    : currentFolder
                      ? 'This folder is empty'
                      : 'Drop files or folders to encrypt & store'}
                </h2>
                <p>
                  {searching
                    ? 'Try another name, hash, or folder path.'
                    : `Uploads land in ${currentFolder || 'Vault'}. Create folders to keep credentials, media, and archives apart.`}
                </p>
                {!searching && (
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
                              setRenameValue(row.name)
                            }}
                            onDoubleClick={() => navigateTo(row.path)}
                            onDragOver={(e) => {
                              if (e.dataTransfer.types.includes('text/evernet-hash')) {
                                e.preventDefault()
                                e.dataTransfer.dropEffect = 'move'
                              }
                            }}
                            onDrop={(e) => {
                              const hash = e.dataTransfer.getData('text/evernet-hash')
                              if (!hash) return
                              e.preventDefault()
                              e.stopPropagation()
                              void handleMoveObject(hash, row.path)
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
                            <button type="button" disabled={busy} onClick={() => void handleDownload(item)}>
                              Download
                            </button>
                            <button
                              type="button"
                              className="danger"
                              disabled={busy}
                              onClick={() => void handleDelete(item.hash)}
                            >
                              Delete
                            </button>
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

      {toast && (
        <div className="dash-toast" role="status">
          {toast}
        </div>
      )}
    </div>
  )
}
