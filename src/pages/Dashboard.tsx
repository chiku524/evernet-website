import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { BuyStorageModal } from '../components/dashboard/BuyStorageModal'
import {
  type ApiObject,
  type ApiProfile,
  apiBase,
  clearSession,
  deleteObject,
  downloadObject,
  fetchPublicConfig,
  getProfile,
  listObjects,
  loginWithFreighter,
  sessionAddress,
  uploadObject,
} from '../lib/api'
import { decryptBlob, encryptFile, walletPassphrase } from '../lib/crypto'
import { fileIconKind, formatBytes } from '../lib/format'
import {
  STORAGE_CONTRACT_ID,
  connectFreighter,
  disconnectFreighterLocal,
  explorerContractUrl,
  explorerTxUrl,
  getFreighterAddress,
  isFreighterInstalled,
  loadPreferredNetwork,
  shortenAddress,
  type StellarNetworkId,
} from '../lib/stellar'

function Icon({ kind }: { kind: ReturnType<typeof fileIconKind> | 'folder' }) {
  const common = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true as const }
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

export default function Dashboard() {
  const [wallet, setWallet] = useState<string | null>(null)
  const [authed, setAuthed] = useState(false)
  const [profile, setProfile] = useState<ApiProfile | null>(null)
  const [objects, setObjects] = useState<ApiObject[]>([])
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [buyOpen, setBuyOpen] = useState(false)
  const [network, setNetwork] = useState<StellarNetworkId>(() => loadPreferredNetwork())
  const [onChain, setOnChain] = useState(false)
  const [contractId, setContractId] = useState(STORAGE_CONTRACT_ID)
  const [apiOnline, setApiOnline] = useState<boolean | null>(null)
  const [hasFreighter, setHasFreighter] = useState<boolean | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dragDepth = useRef(0)

  const refresh = useCallback(async () => {
    if (!sessionAddress()) {
      setProfile(null)
      setObjects([])
      setAuthed(false)
      return
    }
    const [p, objs] = await Promise.all([getProfile(), listObjects()])
    setProfile(p)
    setObjects(objs)
    setAuthed(true)
  }, [])

  useEffect(() => {
    void (async () => {
      setHasFreighter(await isFreighterInstalled())
      try {
        const cfg = await fetchPublicConfig()
        setApiOnline(true)
        setOnChain(cfg.onChain)
        if (cfg.contractId) setContractId(cfg.contractId)
        if (cfg.network === 'public' || cfg.network === 'testnet') {
          setNetwork(cfg.network)
        }
      } catch {
        setApiOnline(false)
      }

      const addr = await getFreighterAddress()
      setWallet(addr)
      if (addr && sessionAddress() === addr) {
        try {
          await refresh()
        } catch {
          clearSession()
          setAuthed(false)
        }
      }
    })()
  }, [refresh])

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 3200)
    return () => window.clearTimeout(t)
  }, [toast])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return objects
    return objects.filter((o) => o.name.toLowerCase().includes(q) || o.hash.includes(q))
  }, [objects, query])

  const selectedObj = objects.find((o) => o.hash === selected) ?? null
  const usage = profile?.usedBytes ?? 0
  const quota = profile?.quotaBytes ?? 0
  const usagePct = quota > 0 ? Math.min(100, (usage / quota) * 100) : 0

  function hashExplorerHref(obj: ApiObject): string {
    if (obj.registrationTx) return explorerTxUrl(obj.registrationTx, network)
    // Legacy uploads without a stored registration tx — open the contract on Testnet explorer
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
      const addr = await connectFreighter()
      setWallet(addr)
      await loginWithFreighter(addr)
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
    await disconnectFreighterLocal()
    setWallet(null)
    setAuthed(false)
    setProfile(null)
    setObjects([])
    setSelected(null)
    setToast('Disconnected — vault hidden')
  }

  async function handleUpload(fileList: FileList | File[]) {
    if (!authed || !wallet) {
      setToast('Connect Freighter to upload')
      return
    }
    setBusy(true)
    try {
      const pass = walletPassphrase(wallet)
      for (const file of Array.from(fileList)) {
        const { ciphertext, header } = await encryptFile(file, pass)
        await uploadObject(ciphertext, {
          name: header.name,
          mimeType: 'application/octet-stream',
          encrypted: true,
        })
      }
      await refresh()
      setToast(`Uploaded ${fileList.length} encrypted object(s)`)
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

  return (
    <div className="dash" onClick={() => setMenuOpen(false)}>
      <aside className={`dash-sidebar ${menuOpen ? 'open' : ''}`} onClick={(e) => e.stopPropagation()}>
        <Link to="/" className="dash-brand">
          Evernet
        </Link>
        <p className="dash-side-label">Wallet vault</p>
        <nav className="dash-nav" aria-label="Vault">
          <button type="button" className="dash-nav-btn active">
            My objects
          </button>
          <button type="button" className="dash-nav-btn" onClick={() => setBuyOpen(true)}>
            Buy storage
          </button>
          <Link to="/docs" className="dash-nav-btn">
            Docs
          </Link>
        </nav>

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
          <div className="dash-crumbs">
            <span className="dash-crumb current">
              {wallet ? `Vault · ${shortenAddress(wallet)}` : 'Connect a wallet to open your vault'}
            </span>
          </div>
          <div className="dash-top-actions">
            {authed && (
              <label className="dash-search">
                <span className="sr-only">Search files</span>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search objects…"
                  type="search"
                />
              </label>
            )}
            {!authed ? (
              <button type="button" className="dash-btn primary" disabled={busy} onClick={() => void connectAndAuth()}>
                {busy ? 'Connecting…' : hasFreighter === false ? 'Install Freighter' : 'Connect Freighter'}
              </button>
            ) : (
              <>
                <button type="button" className="dash-btn ghost" onClick={() => setBuyOpen(true)}>
                  Buy with XLM
                </button>
                <button
                  type="button"
                  className="dash-btn primary"
                  disabled={busy}
                  onClick={() => fileInputRef.current?.click()}
                >
                  Upload
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
            if (e.dataTransfer.files?.length) void handleUpload(e.dataTransfer.files)
          }}
        >
          <div className="dash-panel">
            {!authed ? (
              <div className="dash-empty">
                <h2>Your storage is tied to your Stellar wallet</h2>
                <p>
                  Connect Freighter to load the Soroban storage profile for that address. Files are encrypted in-browser,
                  stored on the Evernet API, and registered on-chain.
                </p>
                <button type="button" className="dash-btn primary" disabled={busy} onClick={() => void connectAndAuth()}>
                  {busy ? 'Connecting…' : hasFreighter === false ? 'Install Freighter' : 'Connect Freighter'}
                </button>
                {apiOnline === false && (
                  <p style={{ color: '#a33d2d', marginTop: '1rem' }}>
                    Storage API unreachable at {apiBase()}. Start it with <code>npm run api</code>.
                  </p>
                )}
              </div>
            ) : visible.length === 0 ? (
              <div className="dash-empty">
                <h2>{query ? 'No matches' : 'Drop files to encrypt & store'}</h2>
                <p>
                  Objects are ciphertext-only on the Evernet node, keyed to {shortenAddress(wallet!)}. Same wallet on
                  another browser sees the same vault.
                </p>
                {!query && (
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
                      const iconKind = fileIconKind(item.mimeType, item.name)
                      return (
                        <tr
                          key={item.hash}
                          className={selected === item.hash ? 'selected' : ''}
                          onClick={() => setSelected(item.hash)}
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
                          <td>{item.shards}</td>
                          <td>{formatDate(item.createdAt)}</td>
                          <td className="dash-row-actions" onClick={(e) => e.stopPropagation()}>
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
                    <dt>Owner</dt>
                    <dd>{shortenAddress(selectedObj.owner)}</dd>
                  </div>
                  <div>
                    <dt>Size</dt>
                    <dd>{formatBytes(selectedObj.size)}</dd>
                  </div>
                  <div>
                    <dt>Encryption</dt>
                    <dd>{selectedObj.encrypted ? 'AES-GCM · client-side' : 'Off'}</dd>
                  </div>
                </dl>
              </>
            ) : (
              <>
                <p className="dash-detail-label">Protocol</p>
                <h2>Wallet-linked storage</h2>
                <p className="dash-detail-copy">
                  Quota and object registrations live on the Soroban <code>storage-market</code> contract. Encrypted
                  bytes live on the Evernet storage API, authorized by Freighter challenge signatures.
                </p>
                <ul className="dash-detail-list">
                  <li>Identity = Stellar address</li>
                  <li>Leases credited after XLM payment</li>
                  <li>Client-side encryption before upload</li>
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
              <p>Drop to encrypt & upload</p>
            </div>
          )}
        </div>
      </div>

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
