import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { DEFAULT_RECEIVER, STORAGE_CONTRACT_ID, STORAGE_PLANS } from '../lib/stellar'
import { WALLET_CATALOGUE } from '../lib/wallet'
import { formatBytes } from '../lib/format'
import { apiBase } from '../lib/api'
import BrandMark from '../components/BrandMark'

const tocGuide = [
  { id: 'overview', label: 'What is Evernet?' },
  { id: 'quickstart', label: 'Quick start' },
  { id: 'wallet', label: 'Supported wallets' },
  { id: 'mobile', label: 'Using Evernet on mobile' },
  { id: 'networks', label: 'Testnet vs Mainnet' },
  { id: 'vault', label: 'Using the vault' },
  { id: 'passphrase', label: 'Vault passphrase' },
  { id: 'plans', label: 'Storage plans' },
  { id: 'how', label: 'How it works' },
  { id: 'security', label: 'Security' },
]

const tocDev = [
  { id: 'api', label: 'Developer API' },
  { id: 'api-auth', label: 'API authentication' },
  { id: 'cloud', label: 'Cloud storage (S3-shaped)' },
  { id: 'sdk', label: 'TypeScript SDK' },
  { id: 'api-keys', label: 'API keys' },
  { id: 'projects', label: 'Project pools' },
  { id: 'labs', label: 'Reference app' },
  { id: 'api-reference', label: 'API reference' },
  { id: 'api-examples', label: 'API examples' },
  { id: 'api-cors', label: 'CORS & access' },
]

const tocMore = [
  { id: 'faq', label: 'FAQ' },
  { id: 'links', label: 'Links & contracts' },
]

const ALL_SECTIONS = [...tocGuide, ...tocDev, ...tocMore]
const SECTION_IDS = new Set(ALL_SECTIONS.map((item) => item.id))
const DEFAULT_SECTION = 'overview'

const API_BASE = 'https://evernet-storage-api.vercel.app'

function sectionFromHash(hash: string) {
  const id = hash.replace(/^#/, '')
  return SECTION_IDS.has(id) ? id : DEFAULT_SECTION
}

function TocLink({
  id,
  label,
  active,
  onSelect,
}: {
  id: string
  label: string
  active: boolean
  onSelect: (id: string) => void
}) {
  return (
    <li>
      <a
        href={`#${id}`}
        className={active ? 'is-active' : undefined}
        aria-current={active ? 'page' : undefined}
        onClick={(event) => {
          event.preventDefault()
          onSelect(id)
        }}
      >
        {label}
      </a>
    </li>
  )
}

export default function Docs() {
  const location = useLocation()
  const navigate = useNavigate()
  const articleRef = useRef<HTMLElement>(null)
  const activeId = useMemo(() => sectionFromHash(location.hash), [location.hash])

  const selectSection = (id: string) => {
    if (!SECTION_IDS.has(id)) return
    navigate({ pathname: '/docs', hash: id })
  }

  useLayoutEffect(() => {
    const article = articleRef.current
    if (!article) return
    for (const section of article.querySelectorAll<HTMLElement>(':scope > section[id]')) {
      section.hidden = section.id !== activeId
    }
  }, [activeId])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [activeId])

  return (
    <div className="docs-page">
      <header className="docs-top">
        <div className="container docs-top-inner">
          <Link to="/" className="docs-brand">
            <BrandMark className="brand-mark" size={24} />
            Evernet
          </Link>
          <nav className="docs-top-nav" aria-label="Site">
            <Link to="/docs">Docs</Link>
            <a
              href="#api"
              onClick={(event) => {
                event.preventDefault()
                selectSection('api')
              }}
            >
              API
            </a>
            <Link to="/labs/notes">Labs</Link>
            <Link to="/dashboard">Vault</Link>
            <Link className="docs-top-cta" to="/dashboard">
              Open vault
            </Link>
          </nav>
        </div>
      </header>

      <div className="container docs-layout">
        <aside className="docs-toc" aria-label="Documentation sections">
          <p className="docs-toc-label">Guide</p>
          <ul>
            {tocGuide.map((item) => (
              <TocLink
                key={item.id}
                id={item.id}
                label={item.label}
                active={activeId === item.id}
                onSelect={selectSection}
              />
            ))}
          </ul>
          <p className="docs-toc-label">Developers</p>
          <ul>
            {tocDev.map((item) => (
              <TocLink
                key={item.id}
                id={item.id}
                label={item.label}
                active={activeId === item.id}
                onSelect={selectSection}
              />
            ))}
          </ul>
          <p className="docs-toc-label">More</p>
          <ul>
            {tocMore.map((item) => (
              <TocLink
                key={item.id}
                id={item.id}
                label={item.label}
                active={activeId === item.id}
                onSelect={selectSection}
              />
            ))}
          </ul>
        </aside>

        <article
          ref={articleRef}
          className="docs-content"
          onClick={(event) => {
            const target = (event.target as HTMLElement).closest('a[href^="#"]')
            if (!(target instanceof HTMLAnchorElement)) return
            const id = target.getAttribute('href')?.slice(1)
            if (!id || !SECTION_IDS.has(id)) return
            event.preventDefault()
            selectSection(id)
          }}
        >
          <p className="eyebrow">Documentation</p>
          {activeId === DEFAULT_SECTION ? (
            <>
              <h1>Evernet docs</h1>
              <p className="docs-lead">
                Connect a Stellar wallet, unlock a vault passphrase, buy capacity with XLM, and store encrypted files —
                or integrate the same surface from apps via <code>evernet-sdk</code> and the public HTTP API.
              </p>
            </>
          ) : null}

          <section id="overview">
            <h2>What is Evernet?</h2>
            <p>
              Evernet is a <strong>wallet-linked object storage service</strong> for the Stellar ecosystem. Your Stellar
              address is your storage identity. Quota and content-hash registrations live on a Soroban smart contract;
              file bytes are encrypted client-side and stored as ciphertext on the Evernet storage API (Vercel Blob in
              production).
            </p>
            <p>
              Stellar does not hold the files — it holds the control plane: who paid, how much space they have, and which
              content hashes belong to which wallet. Folders, filenames, API keys, and project soft caps live off-chain on
              the API.
            </p>
          </section>

          <section id="quickstart">
            <h2>Quick start</h2>
            <ol className="docs-steps">
              <li>
                Open the <Link to="/dashboard">vault</Link> and click <strong>Connect wallet</strong>.
              </li>
              <li>
                Pick your wallet from the list. Wallets you already have installed are shown as available; the rest link
                to their download page.
              </li>
              <li>
                Approve the connection, then sign the Evernet auth challenge. The challenge is a sequence-0 transaction
                that can never be submitted to the network — signing it costs nothing and moves no funds.
              </li>
              <li>
                Set your wallet to <strong>Testnet</strong> for free testing (Friendbot gives you test XLM), or{' '}
                <strong>Public</strong> for Mainnet.
              </li>
              <li>
                On first upload or download, unlock a <a href="#passphrase">vault passphrase</a> (personal secret
                recommended, or convenience mode).
              </li>
              <li>Upload files (encrypted in-browser) or buy more capacity with XLM.</li>
            </ol>
          </section>

          <section id="wallet">
            <h2>Supported wallets</h2>
            <p>
              Evernet connects through the{' '}
              <a href="https://stellarwalletskit.dev/" target="_blank" rel="noreferrer">
                Stellar Wallets Kit
              </a>
              , so any wallet in the Stellar ecosystem works — not just Freighter.
            </p>
            <div className="docs-table-wrap">
              <table className="docs-table">
                <thead>
                  <tr>
                    <th>Wallet</th>
                    <th>Platforms</th>
                  </tr>
                </thead>
                <tbody>
                  {WALLET_CATALOGUE.map((wallet) => (
                    <tr key={wallet.name}>
                      <td>
                        <a href={wallet.url} target="_blank" rel="noreferrer">
                          {wallet.name}
                        </a>
                      </td>
                      <td>{wallet.platforms}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>
              Hardware wallets (Ledger, Trezor) and WalletConnect can be enabled per-deployment. Disconnect anytime from
              the vault header; your on-chain profile stays tied to that address.
            </p>
          </section>

          <section id="mobile">
            <h2>Using Evernet on mobile</h2>
            <p>
              Browser extensions do not exist on mobile, so a phone browser cannot see Freighter’s extension the way a
              desktop browser can. There are two ways around this:
            </p>
            <ul>
              <li>
                <strong>Use your wallet’s in-app browser.</strong> Open Freighter, LOBSTR or xBull on your phone, find
                the built-in browser (often “Discover” or “dApps”), and load <code>evernet.tech</code> there. Evernet
                detects that it is running inside the wallet and connects without extra steps.
              </li>
              <li>
                <strong>Use a wallet that works over a link.</strong> LOBSTR, xBull’s web PWA, and Albedo authorise
                through a redirect or deep link, so they work from any mobile browser.
              </li>
            </ul>
            <p>
              Whichever route you take, the vault is keyed to the Stellar address — the same wallet on desktop and mobile
              opens the same files.
            </p>
            <p>
              <strong>WalletConnect status:</strong>{' '}
              {import.meta.env.VITE_WALLETCONNECT_PROJECT_ID?.trim()
                ? 'Enabled on this build (QR pairing available in the connect dialog).'
                : 'Not configured on this deploy. Set VITE_WALLETCONNECT_PROJECT_ID (Reown / WalletConnect Cloud) to add QR pairing for mobile wallets that are not opened as an in-app browser.'}
            </p>
          </section>

          <section id="networks">
            <h2>Testnet vs Mainnet</h2>
            <div className="docs-grid">
              <div>
                <h3>Testnet (default)</h3>
                <p>
                  Free test XLM via Friendbot. Safe for trying uploads and purchases. Evernet’s treasury and storage
                  contract are deployed on Stellar Testnet today — the same network Freighter and xBull call “Testnet”.
                </p>
              </div>
              <div>
                <h3>Mainnet</h3>
                <p>
                  Uses real XLM. Switch your wallet to Public Network and use the Mainnet toggle when buying storage.
                  The treasury account must be funded on Mainnet before payments succeed.
                </p>
              </div>
            </div>
            <p>
              <strong>Horizon and Soroban are not different testnets.</strong> Freighter / xBull’s Testnet setting uses
              passphrase <code>Test SDF Network ; September 2015</code>. Evernet uses that same network: Horizon for
              payments and account history, Soroban RPC for the quota/lease contract. Set the wallet to{' '}
              <strong>Testnet</strong> (not Futurenet, not Mainnet) and you are on the right rail.
            </p>
            <p>
              Always match your wallet’s network to the network selected in the Buy Storage modal, or the transaction
              will be rejected.
            </p>
          </section>

          <section id="vault">
            <h2>Using the vault</h2>
            <ul>
              <li>
                <strong>Folders</strong> — create folders to organize uploads. Breadcrumbs navigate the tree; drag a
                file onto a folder row to move it. Folder names live on the Evernet API (not on Stellar) so organizing
                stays cheap and private from the public ledger.
              </li>
              <li>
                <strong>Upload / drag-and-drop</strong> — after you unlock a passphrase, files are encrypted client-side
                (AES-GCM), then sent as ciphertext into the folder you’re viewing. Dropping a directory (or Upload
                folder) preserves the relative tree. A content hash is registered to your wallet on Soroban when
                on-chain mode is enabled.
              </li>
              <li>
                <strong>Download</strong> — ciphertext is fetched and decrypted in your browser with the same passphrase
                used at upload. Use the same Stellar address <em>and</em> passphrase on another device to recover files.
              </li>
              <li>
                <strong>Rename & move</strong> — select a file or folder to rename it, or move a file into another
                folder from the detail panel. Search finds files across every folder and can jump to their location.
              </li>
              <li>
                <strong>Delete</strong> — removes a blob and frees quota, or deletes a folder (optionally with
                everything inside it).
              </li>
              <li>
                <strong>Quota meter</strong> — shows used vs total bytes from your on-chain / API profile (includes the
                free 5 GB base tier). Folders themselves do not consume quota.
              </li>
              <li>
                <strong>Developers</strong> — with nothing selected, the protocol panel manages{' '}
                <a href="#projects">project pools</a> and <a href="#api-keys">API keys</a> for server integrations.
              </li>
            </ul>
          </section>

          <section id="passphrase">
            <h2>Vault passphrase</h2>
            <p>
              Uploads and downloads in the vault ask you to unlock encryption. Choose a personal passphrase (min 8
              characters) or convenience mode (wallet-derived helper for demos). Optionally remember on this device —
              stored only in the browser, never sent to the API.
            </p>
            <p>
              Files encrypted with different passphrases cannot be mixed; a wrong passphrase fails decryption. Prefer a
              strong personal secret over convenience mode for real data. Disconnecting clears an unlocked session
              passphrase from memory (remembered secrets stay until you clear site data).
            </p>
          </section>

          <section id="plans">
            <h2>Storage plans</h2>
            <p>
              Purchases are native <strong>XLM payments</strong> to the Evernet treasury. After Horizon confirms the
              transaction, the storage API credits your Soroban profile.
            </p>
            <div className="docs-table-wrap">
              <table className="docs-table">
                <thead>
                  <tr>
                    <th>Plan</th>
                    <th>Capacity</th>
                    <th>Price</th>
                  </tr>
                </thead>
                <tbody>
                  {STORAGE_PLANS.map((plan) => (
                    <tr key={plan.id}>
                      <td>
                        {plan.name}
                        {plan.popular ? ' · Popular' : ''}
                      </td>
                      <td>+{formatBytes(plan.bytes)}</td>
                      <td>{plan.priceXlm} XLM</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>
              Each payment hash can only be credited once. Leases extend for 30 days per purchase on the current
              contract.
            </p>
          </section>

          <section id="how">
            <h2>How it works</h2>
            <ol className="docs-steps">
              <li>
                <strong>Identity</strong> — your Stellar address <code>G…</code>
              </li>
              <li>
                <strong>Auth</strong> — you sign a one-time SEP-10 style challenge transaction; the API verifies the
                signature and issues a session token for that address
              </li>
              <li>
                <strong>Pay</strong> — your wallet signs an XLM payment to the treasury on Stellar
              </li>
              <li>
                <strong>Credit</strong> — API verifies the payment on Horizon, then calls Soroban{' '}
                <code>credit_purchase</code>
              </li>
              <li>
                <strong>Store</strong> — client encrypts with your vault passphrase; ciphertext goes to the Evernet
                storage API; hashes/sizes register on-chain
              </li>
            </ol>
          </section>

          <section id="security">
            <h2>Security</h2>
            <ul>
              <li>Files are encrypted in the browser before upload — the API stores ciphertext.</li>
              <li>
                The vault prompts for a <a href="#passphrase">personal passphrase</a> (recommended). Convenience mode
                still offers a wallet-derived helper for demos.
              </li>
              <li>
                The login challenge is a sequence-0 transaction with a random nonce and a five-minute expiry. It is not
                submittable, so signing it can never move funds.
              </li>
              <li>Never share your wallet’s secret key or recovery phrase. Evernet never asks for it.</li>
              <li>Only connect a wallet on the official Evernet site you trust.</li>
            </ul>
          </section>

          <section id="api">
            <h2>Developer API</h2>
            <p>
              Evernet exposes a REST API for wallet-linked object storage — the same surface the vault uses. Use it from
              Stellar dApps, backends, or scripts when you need encrypted blobs with on-chain quota and content hashes,
              not a general SQL database (that’s closer to D1/RDS) or a full AWS stack.
            </p>
            <div className="docs-grid">
              <div>
                <h3>Base URL</h3>
                <p>
                  <code>{API_BASE}</code>
                </p>
                <p>
                  Machine-readable spec:{' '}
                  <a href={`${API_BASE}/openapi.json`} target="_blank" rel="noreferrer">
                    /openapi.json
                  </a>
                </p>
              </div>
              <div>
                <h3>What it stores</h3>
                <p>
                  Opaque objects (prefer client-side ciphertext). Folders are path metadata on the API. Quota and object
                  hashes register on Soroban when on-chain mode is enabled.
                </p>
              </div>
            </div>
            <p>
              Responses include header <code>X-Evernet-Api-Version: 1</code>. Internal blob locators are never returned
              to clients.
            </p>
          </section>

          <section id="api-auth">
            <h2>API authentication</h2>
            <p>Two modes, both authorize as a Stellar wallet’s vault:</p>
            <ol className="docs-steps">
              <li>
                <strong>Wallet JWT</strong> — <code>POST /auth/challenge</code> → sign XDR (do not submit) →{' '}
                <code>POST /auth/verify</code> → <code>Authorization: Bearer &lt;jwt&gt;</code> (~24h).
              </li>
              <li>
                <strong>API key</strong> — create from the vault (wallet session), then{' '}
                <code>Authorization: Bearer evn_live_…</code> or <code>X-Evernet-Api-Key</code>. Keys share the wallet’s
                quota (and optional <a href="#projects">project</a> soft cap). Create/revoke requires a JWT, not another
                key.
              </li>
            </ol>
          </section>

          <section id="cloud">
            <h2>Cloud storage (S3-shaped)</h2>
            <p>
              Toward wallet-native cloud storage on Stellar, Evernet exposes a JSON <strong>S3-shaped</strong> surface
              under <code>/s3/v1</code> (not full AWS XML compatibility yet). Same vault, auth, quota, and encryption
              model — with keys, multipart, ranged GET, HEAD/copy, opt-in versioning, lifecycle rules, soft-delete trash,
              batch delete, presigned downloads, and revocable share grants.
            </p>
            <div className="docs-table-wrap">
              <table className="docs-table">
                <thead>
                  <tr>
                    <th>Capability</th>
                    <th>Endpoint</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>List by prefix</td>
                    <td>
                      <code>GET /s3/v1/objects?prefix=&amp;delimiter=/&amp;trash=</code>
                    </td>
                    <td>
                      Returns <code>contents</code> + <code>commonPrefixes</code>;{' '}
                      <code>trash=only</code> lists soft-deleted keys
                    </td>
                  </tr>
                  <tr>
                    <td>Put object</td>
                    <td>
                      <code>PUT /s3/v1/object?key=docs/a.bin</code>
                    </td>
                    <td>Raw body · max 80&nbsp;MB · headers <code>X-Evernet-Mime</code>, <code>X-Evernet-Encrypted</code></td>
                  </tr>
                  <tr>
                    <td>Get / Head</td>
                    <td>
                      <code>GET|HEAD /s3/v1/object?key=…</code>
                    </td>
                    <td>
                      GET supports <code>Range</code>; HEAD returns size/hash/ETag
                    </td>
                  </tr>
                  <tr>
                    <td>Copy</td>
                    <td>
                      <code>POST /s3/v1/copy</code>
                    </td>
                    <td>
                      <code>{`{ fromKey, toKey }`}</code> within the same wallet
                    </td>
                  </tr>
                  <tr>
                    <td>Versioning</td>
                    <td>
                      <code>GET|PUT /s3/v1/versioning</code>
                    </td>
                    <td>
                      Opt-in <code>Enabled</code> / <code>Suspended</code> / <code>Disabled</code>; versions count
                      against quota
                    </td>
                  </tr>
                  <tr>
                    <td>List versions</td>
                    <td>
                      <code>GET /s3/v1/versions?prefix=</code>
                    </td>
                    <td>
                      Includes noncurrent + delete markers; <code>versionId</code> = content hash
                    </td>
                  </tr>
                  <tr>
                    <td>Lifecycle</td>
                    <td>
                      <code>GET|PUT /s3/v1/lifecycle</code>
                    </td>
                    <td>
                      Prefix rules: <code>expirationDays</code>, <code>noncurrentDays</code>,{' '}
                      <code>abortMultipartDays</code>
                    </td>
                  </tr>
                  <tr>
                    <td>Delete / trash</td>
                    <td>
                      <code>DELETE /s3/v1/object?key=&amp;versionId=</code>
                    </td>
                    <td>
                      Versioning on → delete marker; else soft-delete (30d);{' '}
                      <code>?versionId=</code> purges that version
                    </td>
                  </tr>
                  <tr>
                    <td>Restore</td>
                    <td>
                      <code>POST /s3/v1/restore</code> · <code>POST /s3/v1/restore-version</code>
                    </td>
                    <td>
                      Trash restore, or promote a prior <code>versionId</code> to latest
                    </td>
                  </tr>
                  <tr>
                    <td>Batch delete</td>
                    <td>
                      <code>POST /s3/v1/delete</code>
                    </td>
                    <td>
                      <code>{`{ keys[], prefix?, permanent? }`}</code>
                    </td>
                  </tr>
                  <tr>
                    <td>Multipart</td>
                    <td>
                      <code>/s3/v1/multipart…</code>
                    </td>
                    <td>Up to 64 parts × 16&nbsp;MB (~1&nbsp;GB)</td>
                  </tr>
                  <tr>
                    <td>Presigned GET</td>
                    <td>
                      <code>POST /s3/v1/presign</code> → <code>GET /s3/v1/presigned/:token</code>
                    </td>
                    <td>Short-lived download URL (not revocable)</td>
                  </tr>
                  <tr>
                    <td>Share grants</td>
                    <td>
                      <code>POST /s3/v1/grants</code> → <code>GET /s3/v1/shared/:token</code>
                    </td>
                    <td>Revocable; optional <code>grantee</code> G-address lock</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <pre className="docs-code">
              <code>{`# after wallet JWT or API key
curl -X PUT "${API_BASE}/s3/v1/object?key=docs/report.bin" \\
  -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/octet-stream" \\
  -H "X-Evernet-Encrypted: true" \\
  --data-binary @ciphertext.bin

curl -X PUT ${API_BASE}/s3/v1/versioning \\
  -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"status":"Enabled"}'

curl -X PUT ${API_BASE}/s3/v1/lifecycle \\
  -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"rules":[{"id":"docs","enabled":true,"prefix":"docs/","noncurrentDays":30,"expirationDays":365,"abortMultipartDays":7}]}'

curl -X POST ${API_BASE}/s3/v1/presign \\
  -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"key":"docs/report.bin","expiresInSec":3600}'`}</code>
            </pre>
            <p>
              Probe:{' '}
              <a href={`${API_BASE}/s3/v1`} target="_blank" rel="noreferrer">
                {`${API_BASE}/s3/v1`}
              </a>
              · status:{' '}
              <a href={`${API_BASE}/status`} target="_blank" rel="noreferrer">
                {`${API_BASE}/status`}
              </a>
              . SDK helpers: <code>setVersioning</code>, <code>setLifecycle</code>, <code>s3ListVersions</code>,{' '}
              <code>s3RestoreVersion</code>, <code>s3Put</code>/<code>s3Get</code>/<code>s3Delete</code>,{' '}
              <code>getStatus</code>. Install <code>evernet-sdk@0.5.0</code>+.
            </p>
          </section>

          <section id="sdk">
            <h2>TypeScript SDK</h2>
            <p>
              Package{' '}
              <a href="https://www.npmjs.com/package/evernet-sdk" target="_blank" rel="noreferrer">
                evernet-sdk
              </a>{' '}
              wraps auth, folders, quota, projects, API keys, and the canonical encrypt → upload → hash path. Source:{' '}
              <code>sdk/</code>.
            </p>
            <pre className="docs-code">
              <code>{`import { EvernetClient, walletPassphrase } from 'evernet-sdk'

const client = new EvernetClient({
  baseUrl: '${API_BASE}',
})

// Wallet signs the challenge (never submit the tx)
await client.loginWithSigner(address, async (xdr, network) => signWithWallet(xdr, network))

// Prefer a strong user passphrase; walletPassphrase() is a demo convenience helper
const passphrase = 'your-strong-secret' // or walletPassphrase(address)

const { object } = await client.encryptAndUpload({
  data: new TextEncoder().encode('secret notes'),
  name: 'notes.txt',
  mimeType: 'text/plain',
  folder: 'docs',
  passphrase,
})

console.log(object.hash, object.registrationTx)

const plain = await client.downloadAndDecrypt(object.hash, passphrase)`}</code>
            </pre>
            <p>
              Install: <code>npm install evernet-sdk</code>. Runnable example:{' '}
              <code>npm run sdk:example -- {API_BASE}</code>
            </p>
          </section>

          <section id="api-keys">
            <h2>API keys</h2>
            <p>
              Open the <Link to="/dashboard">vault</Link>, deselect any file/folder so the protocol panel shows, then
              create a key under <strong>Developer API keys</strong>. Optionally bind the key to a project. The secret is
              shown once.
            </p>
            <pre className="docs-code">
              <code>{`curl -s ${API_BASE}/usage \\
  -H "Authorization: Bearer $EVERNET_API_KEY"`}</code>
            </pre>
            <p>
              Metering: wallet quota (<code>usedBytes</code> / <code>quotaBytes</code>), optional{' '}
              <a href="#projects">project soft caps</a>, and rate-limit headers (~120 req/min per identity).
            </p>
          </section>

          <section id="projects">
            <h2>Project pools</h2>
            <p>
              Projects are named soft caps inside a wallet’s paid quota. Create them in the vault protocol panel, then
              bind an API key with <code>projectId</code>. Uploads through that key credit the project’s{' '}
              <code>usedBytes</code> and fail with 402 when the soft cap is exceeded (wallet quota still applies).
            </p>
            <pre className="docs-code">
              <code>{`# wallet JWT required
curl -X POST ${API_BASE}/projects \\
  -H "Authorization: Bearer $JWT" \\
  -H "Content-Type: application/json" \\
  -d '{"name":"mobile-app","maxBytes":2147483648}'

curl -X POST ${API_BASE}/keys \\
  -H "Authorization: Bearer $JWT" \\
  -H "Content-Type: application/json" \\
  -d '{"name":"mobile-prod","projectId":"<projectId>"}'`}</code>
            </pre>
          </section>

          <section id="labs">
            <h2>Reference app</h2>
            <p>
              Try the SDK in a tiny encrypted-notes dApp:{' '}
              <Link to="/labs/notes">evernet.tech/labs/notes</Link>. It connects a wallet, encrypts JSON notes
              client-side, stores them under <code>labs/encrypted-notes</code>, and lists them from the same vault.
            </p>
          </section>

          <section id="api-reference">
            <h2>API reference</h2>
            <div className="docs-table-wrap">
              <table className="docs-table">
                <thead>
                  <tr>
                    <th>Method</th>
                    <th>Path</th>
                    <th>Auth</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <code>GET</code>
                    </td>
                    <td>
                      <code>/</code>
                    </td>
                    <td>—</td>
                    <td>API index + doc links</td>
                  </tr>
                  <tr>
                    <td>
                      <code>GET</code>
                    </td>
                    <td>
                      <code>/health</code>
                    </td>
                    <td>—</td>
                    <td>Liveness, network, storage driver</td>
                  </tr>
                  <tr>
                    <td>
                      <code>GET</code>
                    </td>
                    <td>
                      <code>/openapi.json</code>
                    </td>
                    <td>—</td>
                    <td>OpenAPI 3 document</td>
                  </tr>
                  <tr>
                    <td>
                      <code>GET</code>
                    </td>
                    <td>
                      <code>/config/public</code>
                    </td>
                    <td>—</td>
                    <td>Treasury, contract, plan catalog</td>
                  </tr>
                  <tr>
                    <td>
                      <code>POST</code>
                    </td>
                    <td>
                      <code>/auth/challenge</code>
                    </td>
                    <td>—</td>
                    <td>Start wallet login</td>
                  </tr>
                  <tr>
                    <td>
                      <code>POST</code>
                    </td>
                    <td>
                      <code>/auth/verify</code>
                    </td>
                    <td>—</td>
                    <td>Exchange signed XDR for JWT</td>
                  </tr>
                  <tr>
                    <td>
                      <code>GET</code>
                    </td>
                    <td>
                      <code>/profile</code>
                    </td>
                    <td>Bearer</td>
                    <td>Quota, used, lease, object count</td>
                  </tr>
                  <tr>
                    <td>
                      <code>GET</code>
                    </td>
                    <td>
                      <code>/usage</code>
                    </td>
                    <td>Bearer</td>
                    <td>Profile + auth type + optional project usage + rate limits</td>
                  </tr>
                  <tr>
                    <td>
                      <code>GET</code> / <code>POST</code>
                    </td>
                    <td>
                      <code>/keys</code>
                    </td>
                    <td>JWT</td>
                    <td>List / create API keys (optional <code>projectId</code>)</td>
                  </tr>
                  <tr>
                    <td>
                      <code>DELETE</code>
                    </td>
                    <td>
                      <code>/keys/:id</code>
                    </td>
                    <td>JWT</td>
                    <td>Revoke API key</td>
                  </tr>
                  <tr>
                    <td>
                      <code>GET</code> / <code>POST</code>
                    </td>
                    <td>
                      <code>/projects</code>
                    </td>
                    <td>JWT</td>
                    <td>List / create project soft-cap pools</td>
                  </tr>
                  <tr>
                    <td>
                      <code>PATCH</code> / <code>DELETE</code>
                    </td>
                    <td>
                      <code>/projects/:id</code>
                    </td>
                    <td>JWT</td>
                    <td>Update or archive a project</td>
                  </tr>
                  <tr>
                    <td>
                      <code>GET</code>
                    </td>
                    <td>
                      <code>/objects</code>
                    </td>
                    <td>Bearer</td>
                    <td>
                      <code>{`{ objects, folders }`}</code>
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <code>POST</code>
                    </td>
                    <td>
                      <code>/objects</code>
                    </td>
                    <td>Bearer</td>
                    <td>Multipart upload · max 80&nbsp;MB · 402 if over quota</td>
                  </tr>
                  <tr>
                    <td>
                      <code>GET</code>
                    </td>
                    <td>
                      <code>/objects/:hash</code>
                    </td>
                    <td>Bearer</td>
                    <td>
                      Binary body · <code>X-Object-Name</code>, <code>X-Object-Mime</code>
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <code>PATCH</code>
                    </td>
                    <td>
                      <code>/objects/:hash</code>
                    </td>
                    <td>Bearer</td>
                    <td>
                      JSON <code>name</code> / <code>folder</code>
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <code>DELETE</code>
                    </td>
                    <td>
                      <code>/objects/:hash</code>
                    </td>
                    <td>Bearer</td>
                    <td>Removes blob + on-chain registration</td>
                  </tr>
                  <tr>
                    <td>
                      <code>GET/POST/PATCH/DELETE</code>
                    </td>
                    <td>
                      <code>/folders</code>
                    </td>
                    <td>Bearer</td>
                    <td>Create, rename, delete folder paths</td>
                  </tr>
                  <tr>
                    <td>
                      <code>POST</code>
                    </td>
                    <td>
                      <code>/purchases/confirm</code>
                    </td>
                    <td>Bearer</td>
                    <td>
                      <code>{`{ planId, txHash }`}</code> after XLM payment
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <code>*</code>
                    </td>
                    <td>
                      <code>/s3/v1/…</code>
                    </td>
                    <td>Bearer*</td>
                    <td>
                      S3-shaped cloud surface — see <a href="#cloud">Cloud storage</a> (*presigned GET is public)
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p>
              Full field schemas live in{' '}
              <a href={`${API_BASE}/openapi.json`} target="_blank" rel="noreferrer">
                OpenAPI
              </a>
              . Errors are JSON <code>{`{ "error": "…" }`}</code>.
            </p>
          </section>

          <section id="api-examples">
            <h2>API examples</h2>
            <h3>Discover plans</h3>
            <pre className="docs-code">
              <code>{`curl -s ${API_BASE}/config/public | jq .plans`}</code>
            </pre>
            <h3>Upload (after you have a JWT)</h3>
            <pre className="docs-code">
              <code>{`curl -X POST ${API_BASE}/objects \\
  -H "Authorization: Bearer $TOKEN" \\
  -F "file=@ciphertext.bin" \\
  -F "name=notes.bin" \\
  -F "folder=docs" \\
  -F "encrypted=true"`}</code>
            </pre>
            <h3>TypeScript (fetch)</h3>
            <pre className="docs-code">
              <code>{`const base = '${API_BASE}'

async function listVault(token: string) {
  const res = await fetch(\`\${base}/objects\`, {
    headers: { Authorization: \`Bearer \${token}\` },
  })
  if (!res.ok) throw new Error((await res.json()).error)
  return res.json() as Promise<{ objects: unknown[]; folders: string[] }>
}

async function upload(token: string, bytes: Blob, name: string, folder = '') {
  const body = new FormData()
  body.append('file', bytes, name)
  body.append('name', name)
  body.append('folder', folder)
  body.append('encrypted', 'true')
  const res = await fetch(\`\${base}/objects\`, {
    method: 'POST',
    headers: { Authorization: \`Bearer \${token}\` },
    body,
  })
  if (!res.ok) throw new Error((await res.json()).error)
  return res.json()
}`}</code>
            </pre>
            <p>
              Challenge signing needs a Stellar wallet SDK (see the vault’s{' '}
              <a href="https://stellarwalletskit.dev/" target="_blank" rel="noreferrer">
                Stellar Wallets Kit
              </a>{' '}
              integration). Prefer encrypting bytes in the client before <code>POST /objects</code>.
            </p>
            <p>
              End-to-end smoke (throwaway keypair):{' '}
              <code>cd storage-api && npx tsx src/scripts/smoke-auth.ts {API_BASE}</code>
            </p>
          </section>

          <section id="api-cors">
            <h2>CORS & access</h2>
            <p>
              Browser calls from <code>evernet.tech</code>, <code>*.evernet.tech</code>, Vercel preview hosts, and{' '}
              <code>localhost</code> are allowed. Other website origins are blocked by CORS.
            </p>
            <ul>
              <li>
                <strong>Recommended for third-party apps:</strong> call the API from your backend (no CORS) with an{' '}
                <a href="#api-keys">API key</a>, or after the user signs a challenge in your frontend and you forward the
                JWT.
              </li>
              <li>
                <strong>First-party browser apps on other domains:</strong> request an origin allowlist (
                <code>CORS_ORIGIN</code>) if you need direct browser access.
              </li>
              <li>
                <strong>Project pools:</strong> available now for soft-cap metering per app key (see{' '}
                <a href="#projects">Project pools</a>).
              </li>
            </ul>
          </section>

          <section id="faq">
            <h2>FAQ</h2>
            <dl className="docs-faq">
              <div>
                <dt>Freighter doesn’t show up on my phone</dt>
                <dd>
                  Mobile browsers can’t load browser extensions, so an extension-only wallet is invisible there. Open
                  evernet.tech inside your wallet’s in-app browser, or connect with LOBSTR, xBull or Albedo instead.
                </dd>
              </div>
              <div>
                <dt>My wallet isn’t listed as available</dt>
                <dd>
                  The connect dialog checks which wallets are actually installed. If yours shows an install link, add
                  the extension or app, reload Evernet, and connect again.
                </dd>
              </div>
              <div>
                <dt>Can I see my files without connecting?</dt>
                <dd>No. The vault is empty until a Stellar wallet is connected and authenticated.</dd>
              </div>
              <div>
                <dt>Will the same wallet work on another computer?</dt>
                <dd>
                  Yes — connect the same Stellar address from any supported wallet. Quota is on-chain; objects are served
                  by the Evernet API for that address. You still need the same vault passphrase to decrypt files (unless
                  you used convenience mode, which is derived from the address).
                </dd>
              </div>
              <div>
                <dt>I forgot my passphrase — can Evernet recover my files?</dt>
                <dd>
                  No. Passphrases never leave your browser. Without the passphrase (or convenience mode on the same
                  address), ciphertext cannot be decrypted.
                </dd>
              </div>
              <div>
                <dt>What if my upload fails with “insufficient quota”?</dt>
                <dd>
                  Buy a storage plan with XLM, wait for confirmation, then retry. Free tier starts at 5 GB. If you use a
                  project-bound API key, you may also hit that project’s soft cap (HTTP 402).
                </dd>
              </div>
              <div>
                <dt>Is this Mainnet production storage?</dt>
                <dd>
                  Check <code>GET /status</code> for <code>mainnet.readiness</code>. Testnet is the primary control
                  plane today. Mainnet XLM payments work when wallet + treasury are on Public Network; a Public-network
                  storage-market contract is required for on-chain quota there. Bytes stay off-chain (Blob). A broader
                  decentralized node mesh remains on the roadmap.
                </dd>
              </div>
              <div>
                <dt>Can my app use Evernet like S3?</dt>
                <dd>
                  For encrypted object storage tied to a Stellar wallet — yes, via the{' '}
                  <a href="#cloud">S3-shaped API</a>, <a href="#api">Developer API</a>, and{' '}
                  <a href="#sdk">evernet-sdk</a>. It is not a SQL database or a drop-in AWS SDK. Auth: wallet JWT or API
                  keys; optional project soft caps for metering. Deletes soft-trash for 30 days by default (or create a
                  delete marker when versioning is Enabled). Versioning is opt-in and retained versions count against
                  quota.
                </dd>
              </div>
            </dl>
          </section>

          <section id="links">
            <h2>Links & contracts</h2>
            <ul className="docs-links">
              <li>
                Vault: <Link to="/dashboard">/dashboard</Link>
              </li>
              <li>
                Developer API: <a href="#api">/docs#api</a>
              </li>
              <li>
                Reference notes app: <Link to="/labs/notes">/labs/notes</Link>
              </li>
              <li>
                OpenAPI:{' '}
                <a href={`${API_BASE}/openapi.json`} target="_blank" rel="noreferrer">
                  {API_BASE}/openapi.json
                </a>
              </li>
              <li>
                npm SDK:{' '}
                <a href="https://www.npmjs.com/package/evernet-sdk" target="_blank" rel="noreferrer">
                  evernet-sdk
                </a>
              </li>
              <li>
                Wallet support:{' '}
                <a href="https://stellarwalletskit.dev/" target="_blank" rel="noreferrer">
                  stellarwalletskit.dev
                </a>
              </li>
              <li>
                Storage API: <a href={apiBase()}>{apiBase()}</a>
              </li>
              <li>
                Treasury: <code>{DEFAULT_RECEIVER}</code>
              </li>
              <li>
                Soroban contract:{' '}
                <a
                  href={`https://lab.stellar.org/r/testnet/contract/${STORAGE_CONTRACT_ID}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {STORAGE_CONTRACT_ID}
                </a>
              </li>
              <li>
                Strategy overview: <Link to="/">evernet.tech</Link>
              </li>
            </ul>
          </section>

          <p className="docs-footer-note">
            Need the product story? Start on the <Link to="/">home page</Link>, then open your{' '}
            <Link to="/dashboard">vault</Link>.
          </p>
        </article>
      </div>
    </div>
  )
}
