import { Link } from 'react-router-dom'
import {
  DEFAULT_RECEIVER,
  FREIGHTER_DOWNLOAD_URL,
  STORAGE_CONTRACT_ID,
  STORAGE_PLANS,
} from '../lib/stellar'
import { formatBytes } from '../lib/format'
import { apiBase } from '../lib/api'

const toc = [
  { id: 'overview', label: 'What is Evernet?' },
  { id: 'quickstart', label: 'Quick start' },
  { id: 'wallet', label: 'Freighter wallet' },
  { id: 'networks', label: 'Testnet vs Mainnet' },
  { id: 'vault', label: 'Using the vault' },
  { id: 'plans', label: 'Storage plans' },
  { id: 'how', label: 'How it works' },
  { id: 'security', label: 'Security' },
  { id: 'faq', label: 'FAQ' },
  { id: 'links', label: 'Links & contracts' },
]

export default function Docs() {
  return (
    <div className="docs-page">
      <header className="docs-top">
        <div className="container docs-top-inner">
          <Link to="/" className="docs-brand">
            Evernet
          </Link>
          <nav className="docs-top-nav" aria-label="Site">
            <Link to="/docs">Docs</Link>
            <Link to="/dashboard">Vault</Link>
            <a href={FREIGHTER_DOWNLOAD_URL} target="_blank" rel="noreferrer">
              Get Freighter
            </a>
            <Link className="docs-top-cta" to="/dashboard">
              Open vault
            </Link>
          </nav>
        </div>
      </header>

      <div className="container docs-layout">
        <aside className="docs-toc" aria-label="On this page">
          <p className="docs-toc-label">Guide</p>
          <ul>
            {toc.map((item) => (
              <li key={item.id}>
                <a href={`#${item.id}`}>{item.label}</a>
              </li>
            ))}
          </ul>
        </aside>

        <article className="docs-content">
          <p className="eyebrow">Documentation</p>
          <h1>Evernet user guide</h1>
          <p className="docs-lead">
            Everything you need to connect a Stellar wallet, buy capacity with XLM, and store encrypted files on Evernet.
          </p>

          <section id="overview">
            <h2>What is Evernet?</h2>
            <p>
              Evernet is a <strong>wallet-linked storage service</strong> built for the Stellar ecosystem. Your Freighter
              address is your storage identity. Quota and object registrations live on a Soroban smart contract; file
              bytes are encrypted in your browser and stored on the Evernet storage network.
            </p>
            <p>
              Stellar itself does not hold the files — it holds the control plane: who paid, how much space they have, and
              which content hashes belong to which wallet.
            </p>
          </section>

          <section id="quickstart">
            <h2>Quick start</h2>
            <ol className="docs-steps">
              <li>
                Install{' '}
                <a href={FREIGHTER_DOWNLOAD_URL} target="_blank" rel="noreferrer">
                  Freighter
                </a>{' '}
                (Chrome/Firefox extension or mobile).
              </li>
              <li>
                Open the{' '}
                <Link to="/dashboard">vault</Link> and click <strong>Connect Freighter</strong>. If Freighter is not
                detected, you will be taken to the download page.
              </li>
              <li>Approve the connection and sign the Evernet auth challenge.</li>
              <li>
                Switch Freighter to <strong>Testnet</strong> for free testing (use Friendbot for test XLM), or{' '}
                <strong>Public</strong> for Mainnet.
              </li>
              <li>Upload files (encrypted automatically) or buy more capacity with XLM.</li>
            </ol>
          </section>

          <section id="wallet">
            <h2>Freighter wallet</h2>
            <p>
              Evernet uses Freighter as the Stellar wallet. Without it, you cannot open a vault, sign in, or pay for
              storage.
            </p>
            <ul>
              <li>
                Download: <a href={FREIGHTER_DOWNLOAD_URL} target="_blank" rel="noreferrer">{FREIGHTER_DOWNLOAD_URL}</a>
              </li>
              <li>After installing, refresh Evernet and click Connect Freighter again.</li>
              <li>You will sign a short message to prove you control the address — that starts your vault session.</li>
              <li>Disconnect anytime from the vault header; your on-chain profile remains tied to that address.</li>
            </ul>
          </section>

          <section id="networks">
            <h2>Testnet vs Mainnet</h2>
            <div className="docs-grid">
              <div>
                <h3>Testnet (default)</h3>
                <p>
                  Free test XLM via Friendbot / Freighter. Safe for trying uploads and purchases. Evernet’s treasury and
                  Soroban contract are deployed on Testnet today.
                </p>
              </div>
              <div>
                <h3>Mainnet</h3>
                <p>
                  Uses real XLM. Switch Freighter to Public Network and use the Mainnet toggle when buying storage. The
                  treasury account must be funded on Mainnet before payments succeed.
                </p>
              </div>
            </div>
            <p>
              Always match Freighter’s network to the network selected in the Buy Storage modal, or the transaction will
              be rejected.
            </p>
          </section>

          <section id="vault">
            <h2>Using the vault</h2>
            <ul>
              <li>
                <strong>Upload / drag-and-drop</strong> — files are encrypted client-side (AES-GCM), then sent as
                ciphertext to the Evernet API. A content hash is registered to your wallet on Soroban.
              </li>
              <li>
                <strong>Download</strong> — ciphertext is fetched and decrypted in your browser with a key derived from
                your wallet address (v1 helper). Use the same Freighter address to recover files on another device.
              </li>
              <li>
                <strong>Delete</strong> — removes the blob and frees quota on your profile.
              </li>
              <li>
                <strong>Quota meter</strong> — shows used vs total bytes from your on-chain / API profile (includes the
                free 5 GB base tier).
              </li>
            </ul>
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
                <strong>Identity</strong> — Freighter address <code>G…</code>
              </li>
              <li>
                <strong>Auth</strong> — you sign a one-time challenge; the API issues a session token for that address
              </li>
              <li>
                <strong>Pay</strong> — Freighter submits an XLM payment to the treasury on Stellar
              </li>
              <li>
                <strong>Credit</strong> — API verifies the payment on Horizon, then calls Soroban{' '}
                <code>credit_purchase</code>
              </li>
              <li>
                <strong>Store</strong> — encrypted blobs go to the Evernet storage API; hashes/sizes are registered
                on-chain
              </li>
            </ol>
          </section>

          <section id="security">
            <h2>Security</h2>
            <ul>
              <li>Files are encrypted in the browser before upload — the API stores ciphertext.</li>
              <li>
                v1 uses a wallet-derived passphrase helper for convenience. For higher security, treat this as a demo
                model and prefer a strong personal passphrase in future versions.
              </li>
              <li>Never share your Freighter secret phrase. Evernet never asks for it.</li>
              <li>Only connect Freighter on the official Evernet site you trust.</li>
            </ul>
          </section>

          <section id="faq">
            <h2>FAQ</h2>
            <dl className="docs-faq">
              <div>
                <dt>I clicked Connect Freighter and a new tab opened</dt>
                <dd>
                  Freighter was not detected. Install it from the download page, then return and connect again.
                </dd>
              </div>
              <div>
                <dt>Can I see my files without connecting?</dt>
                <dd>No. The vault is empty until a Freighter wallet is connected and authenticated.</dd>
              </div>
              <div>
                <dt>Will the same wallet work on another computer?</dt>
                <dd>
                  Yes — connect the same Freighter address. Quota is on-chain; objects are served by the Evernet API for
                  that wallet.
                </dd>
              </div>
              <div>
                <dt>What if my upload fails with “insufficient quota”?</dt>
                <dd>
                  Buy a storage plan with XLM, wait for confirmation, then retry. Free tier starts at 5 GB.
                </dd>
              </div>
              <div>
                <dt>Is this Mainnet production storage?</dt>
                <dd>
                  Testnet is the primary demo network today. Mainnet payments are supported when Freighter and the
                  treasury are configured for Public Network. Full decentralized node mesh remains on the roadmap.
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
                Freighter: <a href={FREIGHTER_DOWNLOAD_URL}>{FREIGHTER_DOWNLOAD_URL}</a>
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
