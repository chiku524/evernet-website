import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { EvernetClient, walletPassphrase } from 'evernet-sdk'
import BrandMark from '../components/BrandMark'
import {
  apiBase,
  clearSession,
  ensureSession,
  setSession,
} from '../lib/api'
import {
  loadPreferredNetwork,
  saveAddress,
  shortenAddress,
  type StellarNetworkId,
} from '../lib/stellar'
import { connectWallet, disconnectWallet, restoreWallet } from '../lib/wallet'

type NoteMeta = {
  hash: string
  title: string
  updatedAt: number
}

const FOLDER = 'labs/encrypted-notes'
const TITLE_PREFIX = 'note:'

function vaultItemPath(hash: string) {
  return `/dashboard?hash=${encodeURIComponent(hash)}`
}

function client() {
  return new EvernetClient({
    baseUrl: apiBase(),
    getToken: () => localStorage.getItem('evernet-api-token'),
    onToken: (token, address) => setSession(token, address),
    onClearToken: () => clearSession(),
  })
}

export default function LabsNotes() {
  const [network] = useState<StellarNetworkId>(() => loadPreferredNetwork())
  const [wallet, setWallet] = useState<string | null>(null)
  const [notes, setNotes] = useState<NoteMeta[]>([])
  const [title, setTitle] = useState('Untitled')
  const [body, setBody] = useState('')
  const [activeHash, setActiveHash] = useState<string | null>(null)
  const [vaultUrl, setVaultUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [passMode, setPassMode] = useState<'custom' | 'convenience'>('custom')
  const [passphrase, setPassphrase] = useState('')

  const refreshNotes = useCallback(async () => {
    const listing = await client().list()
    const mapped = listing.objects
      .filter((o) => (o.folder || '') === FOLDER && o.name.startsWith(TITLE_PREFIX))
      .map((o) => ({
        hash: o.hash,
        title: o.name.slice(TITLE_PREFIX.length) || 'Untitled',
        updatedAt: o.createdAt,
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt)
    setNotes(mapped)
  }, [])

  useEffect(() => {
    void (async () => {
      const addr = await restoreWallet(network)
      if (!addr) return
      setWallet(addr)
      try {
        await ensureSession(addr, network)
        await refreshNotes()
      } catch {
        /* empty vault or needs interactive re-login */
      }
    })()
  }, [network, refreshNotes])

  function resolvePass(address: string): string {
    if (passMode === 'convenience') return walletPassphrase(address)
    const pass = passphrase.trim()
    if (pass.length < 8) throw new Error('Passphrase must be at least 8 characters')
    return pass
  }

  async function handleConnect() {
    setBusy(true)
    setStatus(null)
    try {
      const addr = await connectWallet(network)
      saveAddress(addr)
      await ensureSession(addr, network)
      setWallet(addr)
      await refreshNotes()
      setStatus('Connected — notes folder ready')
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Connect failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleDisconnect() {
    clearSession()
    await disconnectWallet()
    saveAddress(null)
    setWallet(null)
    setNotes([])
    setActiveHash(null)
    setVaultUrl(null)
    setBody('')
    setStatus('Disconnected')
  }

  async function handleSave() {
    if (!wallet) return
    setBusy(true)
    setStatus(null)
    setVaultUrl(null)
    try {
      await ensureSession(wallet, network)
      const pass = resolvePass(wallet)
      const c = client()
      await c.createFolder(FOLDER).catch((err) => {
        // Folder may already exist; auth failures should surface.
        const msg = err instanceof Error ? err.message : String(err)
        if (/invalid or expired|missing bearer|revoked/i.test(msg)) throw err
      })
      if (activeHash) {
        await c.deleteObject(activeHash).catch(() => undefined)
      }
      const payload = new TextEncoder().encode(
        JSON.stringify({ title: title.trim() || 'Untitled', body, savedAt: Date.now() }),
      )
      const { object } = await c.encryptAndUpload({
        data: payload,
        name: `${TITLE_PREFIX}${title.trim() || 'Untitled'}`,
        mimeType: 'application/json',
        folder: FOLDER,
        passphrase: pass,
      })
      const path = vaultItemPath(object.hash)
      setActiveHash(object.hash)
      setVaultUrl(`${window.location.origin}${path}`)
      await refreshNotes()
      setStatus(`Saved encrypted note · ${object.hash.slice(0, 12)}…`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Save failed'
      if (/invalid or expired token/i.test(msg)) {
        clearSession()
        setStatus('Session expired — connect again to sign a fresh auth challenge, then retry save.')
      } else {
        setStatus(msg)
      }
    } finally {
      setBusy(false)
    }
  }

  async function handleOpen(note: NoteMeta) {
    if (!wallet) return
    setBusy(true)
    setStatus(null)
    try {
      await ensureSession(wallet, network)
      const pass = resolvePass(wallet)
      const dec = await client().downloadAndDecrypt(note.hash, pass)
      const parsed = JSON.parse(await dec.file.text()) as { title?: string; body?: string }
      setTitle(parsed.title || note.title)
      setBody(parsed.body || '')
      setActiveHash(note.hash)
      setVaultUrl(`${window.location.origin}${vaultItemPath(note.hash)}`)
      setStatus(`Opened ${note.title}`)
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Could not decrypt note')
    } finally {
      setBusy(false)
    }
  }

  async function handleNew() {
    setActiveHash(null)
    setVaultUrl(null)
    setTitle('Untitled')
    setBody('')
    setStatus('New note')
  }

  return (
    <div className="labs-page">
      <header className="labs-top">
        <div className="container labs-top-inner">
          <Link to="/" className="labs-brand">
            <BrandMark className="brand-mark" size={24} />
            Evernet
          </Link>
          <nav className="labs-nav">
            <Link to="/docs#sdk">SDK</Link>
            <Link to="/dashboard">Vault</Link>
            <span className="labs-pill">Reference app</span>
          </nav>
        </div>
      </header>

      <main className="container labs-main">
        <p className="eyebrow">Labs</p>
        <h1>Encrypted notes</h1>
        <p className="labs-lead">
          A minimal dApp on <code>evernet-sdk</code>: connect a wallet, encrypt a note in-browser, upload ciphertext,
          and reopen with your passphrase. Same vault as the dashboard (<code>{FOLDER}</code>).
        </p>

        <div className="labs-grid">
          <aside className="labs-side">
            {!wallet ? (
              <button type="button" className="dash-btn primary" disabled={busy} onClick={() => void handleConnect()}>
                {busy ? 'Connecting…' : 'Connect wallet'}
              </button>
            ) : (
              <>
                <p className="labs-wallet">{shortenAddress(wallet)}</p>
                <button type="button" className="dash-btn ghost" onClick={() => void handleDisconnect()}>
                  Disconnect
                </button>
              </>
            )}

            <label className="labs-field">
              Passphrase mode
              <select
                value={passMode}
                onChange={(e) => setPassMode(e.target.value as 'custom' | 'convenience')}
              >
                <option value="custom">Personal passphrase</option>
                <option value="convenience">Wallet-derived</option>
              </select>
            </label>
            {passMode === 'custom' && (
              <label className="labs-field">
                Passphrase
                <input
                  type="password"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  placeholder="Min 8 characters"
                />
              </label>
            )}

            <p className="labs-side-label">Notes in vault</p>
            <ul className="labs-note-list">
              {notes.length === 0 && <li className="labs-empty">No notes yet</li>}
              {notes.map((n) => (
                <li key={n.hash}>
                  <button type="button" disabled={busy || !wallet} onClick={() => void handleOpen(n)}>
                    {n.title}
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          <section className="labs-editor">
            <div className="labs-editor-bar">
              <input
                className="labs-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Title"
                disabled={!wallet}
              />
              <button type="button" className="dash-btn ghost" disabled={!wallet || busy} onClick={() => void handleNew()}>
                New
              </button>
              <button
                type="button"
                className="dash-btn primary"
                disabled={!wallet || busy}
                onClick={() => void handleSave()}
              >
                {busy ? 'Saving…' : 'Encrypt & save'}
              </button>
            </div>
            <textarea
              className="labs-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write something private…"
              disabled={!wallet}
              rows={16}
            />
            {status && <p className="labs-status">{status}</p>}
            {activeHash && (
              <div className="labs-vault-link">
                <p className="labs-hash">
                  Content hash <code>{activeHash}</code>
                </p>
                <p>
                  Vault item:{' '}
                  <Link to={vaultItemPath(activeHash)}>Open in vault</Link>
                  <span className="labs-folder"> · folder <code>{FOLDER}</code></span>
                </p>
                {vaultUrl && (
                  <p className="labs-url">
                    <a href={vaultUrl}>{vaultUrl}</a>
                  </p>
                )}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  )
}
