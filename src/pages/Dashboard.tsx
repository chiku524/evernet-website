import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { BuyStorageModal } from '../components/dashboard/BuyStorageModal'
import { getTotalQuotaBytes, listPurchases } from '../lib/billing'
import {
  type VaultItem,
  createFolder,
  downloadItem,
  fileIconKind,
  formatBytes,
  getUsageBytes,
  listItems,
  moveToTrash,
  purgeItem,
  renameItem,
  restoreItem,
  toggleStar,
  uploadFiles,
} from '../lib/vault'
import {
  connectFreighter,
  getFreighterAddress,
  loadPreferredNetwork,
  shortenAddress,
  type StellarNetworkId,
} from '../lib/stellar'

type View = 'files' | 'starred' | 'recent' | 'trash'

function Icon({ kind }: { kind: ReturnType<typeof fileIconKind> | 'folder' }) {
  const common = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true as const }
  if (kind === 'folder') {
    return (
      <svg {...common}>
        <path
          d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2h7.5A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5v-9Z"
          stroke="currentColor"
          strokeWidth="1.6"
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
      {(kind === 'image' || kind === 'video') && (
        <circle cx="10" cy="14" r="1.4" fill="currentColor" />
      )}
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

export default function Dashboard() {
  const [items, setItems] = useState<VaultItem[]>([])
  const [usage, setUsage] = useState(0)
  const [quota, setQuota] = useState(() => getTotalQuotaBytes())
  const [view, setView] = useState<View>('files')
  const [folderId, setFolderId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [buyOpen, setBuyOpen] = useState(false)
  const [wallet, setWallet] = useState<string | null>(null)
  const [network, setNetwork] = useState<StellarNetworkId>(() => loadPreferredNetwork())
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dragDepth = useRef(0)

  const refresh = useCallback(async () => {
    const [all, used] = await Promise.all([listItems(), getUsageBytes()])
    setItems(all)
    setUsage(used)
    setQuota(getTotalQuotaBytes())
  }, [])

  useEffect(() => {
    void refresh()
    void getFreighterAddress().then(setWallet)
    setNetwork(loadPreferredNetwork())
  }, [refresh])

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 2800)
    return () => window.clearTimeout(t)
  }, [toast])

  const foldersById = useMemo(() => {
    const map = new Map<string, VaultItem>()
    for (const item of items) if (item.kind === 'folder') map.set(item.id, item)
    return map
  }, [items])

  const breadcrumbs = useMemo(() => {
    const trail: VaultItem[] = []
    let cur = folderId
    while (cur) {
      const folder = foldersById.get(cur)
      if (!folder) break
      trail.unshift(folder)
      cur = folder.parentId
    }
    return trail
  }, [folderId, foldersById])

  const visible = useMemo(() => {
    let list = items
    if (view === 'trash') list = list.filter((i) => i.trashed)
    else list = list.filter((i) => !i.trashed)

    if (view === 'starred') list = list.filter((i) => i.starred)
    if (view === 'recent') {
      list = [...list].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 30)
    }
    if (view === 'files') {
      list = list.filter((i) => i.parentId === folderId)
    }

    if (query.trim()) {
      const q = query.trim().toLowerCase()
      list = list.filter((i) => i.name.toLowerCase().includes(q))
    }

    return [...list].sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  }, [items, view, folderId, query])

  const selectedItem = items.find((i) => i.id === selected) ?? null
  const usagePct = Math.min(100, (usage / quota) * 100)
  const purchaseCount = listPurchases().length

  async function connectWallet() {
    try {
      const addr = await connectFreighter()
      setWallet(addr)
      setToast('Freighter connected')
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Could not connect wallet')
    }
  }

  async function withBusy(action: () => Promise<void>, message?: string) {
    setBusy(true)
    try {
      await action()
      await refresh()
      if (message) setToast(message)
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  async function handleUpload(fileList: FileList | File[]) {
    if (!fileList.length) return
    await withBusy(async () => {
      await uploadFiles(fileList, view === 'files' ? folderId : null)
    }, `Uploaded ${fileList.length} file${fileList.length > 1 ? 's' : ''} · encrypted & sharded`)
  }

  async function handleNewFolder() {
    const name = window.prompt('Folder name')
    if (!name) return
    await withBusy(async () => {
      await createFolder(name, view === 'files' ? folderId : null)
    }, 'Folder created')
  }

  function openItem(item: VaultItem) {
    if (item.kind === 'folder' && view === 'files' && !item.trashed) {
      setFolderId(item.id)
      setSelected(null)
      return
    }
    setSelected(item.id)
  }

  return (
    <div className="dash" onClick={() => setMenuOpen(false)}>
      <aside className={`dash-sidebar ${menuOpen ? 'open' : ''}`} onClick={(e) => e.stopPropagation()}>
        <Link to="/" className="dash-brand">
          Evernet
        </Link>
        <p className="dash-side-label">Vault</p>
        <nav className="dash-nav" aria-label="Vault views">
          {(
            [
              ['files', 'All files'],
              ['starred', 'Starred'],
              ['recent', 'Recent'],
              ['trash', 'Trash'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`dash-nav-btn ${view === id ? 'active' : ''}`}
              onClick={() => {
                setView(id)
                setSelected(null)
                if (id !== 'files') setFolderId(null)
                setMenuOpen(false)
              }}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="dash-quota">
          <div className="dash-quota-top">
            <span>Storage</span>
            <span>
              {formatBytes(usage)} / {formatBytes(quota)}
            </span>
          </div>
          <div className="dash-quota-track">
            <div className="dash-quota-fill" style={{ width: `${usagePct}%` }} />
          </div>
          <p className="dash-quota-note">
            {purchaseCount > 0
              ? `${purchaseCount} Stellar purchase${purchaseCount > 1 ? 's' : ''} credited`
              : '5 GB free · expand with XLM'}
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
                <>Wallet {shortenAddress(wallet)}</>
              ) : (
                <>
                  <button type="button" className="dash-linkish" onClick={() => void connectWallet()}>
                    Connect Freighter
                  </button>
                  {' · '}pay storage in XLM
                </>
              )}
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
          <div className="dash-crumbs">
            {view === 'files' ? (
              <>
                <button
                  type="button"
                  className="dash-crumb"
                  onClick={() => {
                    setFolderId(null)
                    setSelected(null)
                  }}
                >
                  My vault
                </button>
                {breadcrumbs.map((crumb) => (
                  <span key={crumb.id} className="dash-crumb-wrap">
                    <span className="dash-crumb-sep" aria-hidden="true">
                      /
                    </span>
                    <button type="button" className="dash-crumb" onClick={() => setFolderId(crumb.id)}>
                      {crumb.name}
                    </button>
                  </span>
                ))}
              </>
            ) : (
              <span className="dash-crumb current">
                {view === 'starred' ? 'Starred' : view === 'recent' ? 'Recent' : 'Trash'}
              </span>
            )}
          </div>
          <div className="dash-top-actions">
            <label className="dash-search">
              <span className="sr-only">Search files</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search vault…"
                type="search"
              />
            </label>
            <button type="button" className="dash-btn ghost" onClick={() => setBuyOpen(true)}>
              Buy with XLM
            </button>
            {view !== 'trash' && (
              <>
                <button type="button" className="dash-btn ghost" onClick={() => void handleNewFolder()} disabled={busy}>
                  New folder
                </button>
                <button
                  type="button"
                  className="dash-btn primary"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={busy}
                >
                  Upload
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
            if (view === 'trash') return
            if (e.dataTransfer.files?.length) void handleUpload(e.dataTransfer.files)
          }}
        >
          <div className="dash-panel">
            {visible.length === 0 ? (
              <div className="dash-empty">
                <h2>{query ? 'No matches' : view === 'trash' ? 'Trash is empty' : 'Drop files to encrypt & store'}</h2>
                <p>
                  {query
                    ? 'Try a different search term.'
                    : 'Files are sharded across the Evernet node network. This demo vault stores data in your browser.'}
                </p>
                {view !== 'trash' && !query && (
                  <button type="button" className="dash-btn primary" onClick={() => fileInputRef.current?.click()}>
                    Upload files
                  </button>
                )}
              </div>
            ) : (
              <div className="dash-table-wrap">
                <table className="dash-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Size</th>
                      <th>Shards</th>
                      <th>Modified</th>
                      <th aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((item) => {
                      const iconKind = item.kind === 'folder' ? 'folder' : fileIconKind(item.mimeType, item.name)
                      return (
                        <tr
                          key={item.id}
                          className={selected === item.id ? 'selected' : ''}
                          onClick={() => openItem(item)}
                          onDoubleClick={() => {
                            if (item.kind === 'file' && !item.trashed) void downloadItem(item.id)
                          }}
                        >
                          <td>
                            <div className="dash-name">
                              <span className={`dash-file-icon kind-${iconKind}`}>
                                <Icon kind={iconKind} />
                              </span>
                              <span>
                                <strong>{item.name}</strong>
                                <small>
                                  {item.encrypted ? 'Encrypted' : 'Plain'}
                                  {item.starred ? ' · Starred' : ''}
                                </small>
                              </span>
                            </div>
                          </td>
                          <td>{item.kind === 'folder' ? '—' : formatBytes(item.size)}</td>
                          <td>{item.kind === 'folder' ? '—' : item.shards}</td>
                          <td>{formatDate(item.updatedAt)}</td>
                          <td className="dash-row-actions" onClick={(e) => e.stopPropagation()}>
                            {view === 'trash' ? (
                              <>
                                <button type="button" onClick={() => void withBusy(() => restoreItem(item.id), 'Restored')}>
                                  Restore
                                </button>
                                <button
                                  type="button"
                                  className="danger"
                                  onClick={() => void withBusy(() => purgeItem(item.id), 'Permanently deleted')}
                                >
                                  Delete
                                </button>
                              </>
                            ) : (
                              <>
                                {item.kind === 'file' && (
                                  <button type="button" onClick={() => void downloadItem(item.id)}>
                                    Download
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => void withBusy(() => toggleStar(item.id))}
                                  aria-label={item.starred ? 'Unstar' : 'Star'}
                                >
                                  {item.starred ? 'Unstar' : 'Star'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const name = window.prompt('Rename', item.name)
                                    if (name) void withBusy(() => renameItem(item.id, name), 'Renamed')
                                  }}
                                >
                                  Rename
                                </button>
                                <button
                                  type="button"
                                  className="danger"
                                  onClick={() =>
                                    void withBusy(async () => {
                                      await moveToTrash(item.id)
                                      if (folderId === item.id) setFolderId(item.parentId)
                                      setSelected(null)
                                    }, 'Moved to trash')
                                  }
                                >
                                  Trash
                                </button>
                              </>
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

          <aside className="dash-detail" aria-label="File details">
            {selectedItem ? (
              <>
                <p className="dash-detail-label">Details</p>
                <h2>{selectedItem.name}</h2>
                <dl className="dash-meta">
                  <div>
                    <dt>Type</dt>
                    <dd>{selectedItem.kind === 'folder' ? 'Folder' : selectedItem.mimeType || 'File'}</dd>
                  </div>
                  <div>
                    <dt>Size</dt>
                    <dd>{selectedItem.kind === 'folder' ? '—' : formatBytes(selectedItem.size)}</dd>
                  </div>
                  <div>
                    <dt>Encryption</dt>
                    <dd>{selectedItem.encrypted ? 'AES-GCM · client-side' : 'Off'}</dd>
                  </div>
                  <div>
                    <dt>Shards</dt>
                    <dd>{selectedItem.kind === 'folder' ? '—' : `${selectedItem.shards} fragments`}</dd>
                  </div>
                  <div>
                    <dt>Created</dt>
                    <dd>{formatDate(selectedItem.createdAt)}</dd>
                  </div>
                  <div>
                    <dt>Modified</dt>
                    <dd>{formatDate(selectedItem.updatedAt)}</dd>
                  </div>
                </dl>
                <p className="dash-detail-copy">
                  In production, shards replicate across Evernet nodes with proof-of-retrievability. Payments settle on
                  Stellar.
                </p>
              </>
            ) : (
              <>
                <p className="dash-detail-label">Vault</p>
                <h2>Self-custodial storage</h2>
                <p className="dash-detail-copy">
                  Upload documents, media, and dApp assets. This browser demo persists your vault locally via IndexedDB —
                  a preview of the Evernet experience.
                </p>
                <ul className="dash-detail-list">
                  <li>End-to-end encryption</li>
                  <li>Sharded distribution</li>
                  <li>Buy more capacity with XLM on Stellar</li>
                  <li>Freighter wallet payments via Horizon</li>
                </ul>
                <button type="button" className="dash-btn primary" style={{ marginTop: '1rem' }} onClick={() => setBuyOpen(true)}>
                  Buy storage with XLM
                </button>
              </>
            )}
          </aside>

          {dragging && view !== 'trash' && (
            <div className="dash-drop-overlay">
              <p>Drop to upload & encrypt</p>
            </div>
          )}
        </div>
      </div>

      <BuyStorageModal
        open={buyOpen}
        onClose={() => setBuyOpen(false)}
        onPurchased={() => {
          void refresh()
          setNetwork(loadPreferredNetwork())
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
