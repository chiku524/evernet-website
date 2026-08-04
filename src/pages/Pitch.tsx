import { useEffect, useMemo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import BrandMark from '../components/BrandMark'

const fade = {
  hidden: { opacity: 0, y: 22 },
  visible: { opacity: 1, y: 0 },
}

function Section({
  id,
  eyebrow,
  title,
  lead,
  children,
  delay = 0,
}: {
  id?: string
  eyebrow: string
  title: string
  lead?: string
  children?: ReactNode
  delay?: number
}) {
  const reduce = useReducedMotion()
  return (
    <motion.section
      id={id}
      className="pitch-section"
      variants={fade}
      initial={reduce ? false : 'hidden'}
      whileInView="visible"
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1], delay }}
    >
      <p className="pitch-eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      {lead && <p className="pitch-lead">{lead}</p>}
      {children}
    </motion.section>
  )
}

export default function Pitch() {
  const reduce = useReducedMotion()

  useEffect(() => {
    document.title = 'Evernet — Confidential Investor Brief'
    const robots = document.createElement('meta')
    robots.name = 'robots'
    robots.content = 'noindex, nofollow'
    document.head.appendChild(robots)
    return () => {
      document.head.removeChild(robots)
      document.title = 'Evernet — Decentralized Data Storage for Stellar'
    }
  }, [])

  const plans = useMemo(
    () => [
      { name: 'Free', capacity: '5 GB included', price: '—' },
      { name: 'Starter', capacity: '+10 GB', price: '5 XLM' },
      { name: 'Growth', capacity: '+50 GB', price: '20 XLM' },
      { name: 'Pro', capacity: '+200 GB', price: '60 XLM' },
    ],
    [],
  )

  const partners = useMemo(
    () => ['SigeaCloud', 'Obsideo', 'Era Digitalis', 'Peridot', 'Indikin'],
    [],
  )

  return (
    <div className="pitch-page">
      <div className="pitch-confidential">Confidential · For intended recipients only · Do not forward</div>

      <header className="pitch-nav">
        <Link to="/" className="pitch-brand">
          <BrandMark className="brand-mark" size={24} />
          Evernet
        </Link>
        <div className="pitch-nav-meta">
          <span>Investor brief</span>
          <a href="#ask">The ask</a>
        </div>
      </header>

      <main>
        <motion.section
          className="pitch-hero"
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8 }}
        >
          <div className="pitch-hero-glow" aria-hidden="true" />
          <p className="pitch-eyebrow">Executive summary</p>
          <h1 className="pitch-brand-hero">Evernet</h1>
          <p className="pitch-hero-line">The wallet-linked storage layer Stellar has been missing.</p>
          <p className="pitch-hero-sub">
            Decentralized, client-encrypted object storage with wallet identity, XLM capacity, and a
            Soroban control plane — production vault and API at evernet.tech, Testnet leases live today.
          </p>
          <div className="pitch-hero-cta">
            <a className="pitch-btn primary" href="https://evernet.tech/dashboard" target="_blank" rel="noreferrer">
              Open live vault
            </a>
            <a className="pitch-btn ghost" href="#traction">
              See traction
            </a>
          </div>
        </motion.section>

        <Section
          eyebrow="Thesis"
          title="Payments without persistent data leave ecosystems incomplete."
          lead="Stellar moves value better than almost any chain. Builders still bolt on AWS, IPFS gateways, or UX-hostile storage networks when they need documents, media, and credentials. Evernet makes storage a first-class Stellar primitive: your address is your account, XLM buys capacity, and ciphertext stays client-encrypted."
        />

        <Section id="problem" eyebrow="Problem" title="Three gaps. One wedge.">
          <div className="pitch-grid three">
            <article>
              <h3>Centralized default</h3>
              <p>Cloud giants win on UX and speed, then extract rent, censor, and concentrate breach risk.</p>
            </article>
            <article>
              <h3>Decentralized friction</h3>
              <p>
                Many storage networks ask users to learn new wallets, tokens, and mental models — then
                under-deliver on product polish.
              </p>
            </article>
            <article>
              <h3>Stellar’s missing rail</h3>
              <p>
                Asset issuance and payments are mature. A native, wallet-native place to keep the data those
                assets refer to is not.
              </p>
            </article>
          </div>
        </Section>

        <Section
          eyebrow="Solution"
          title="Wallet identity. On-chain control plane. Encrypted data plane."
          lead="Evernet separates what belongs on a public ledger from what must stay private."
        >
          <div className="pitch-split">
            <div>
              <h3>On Stellar / Soroban</h3>
              <ul>
                <li>Storage profiles per G… address (quota, usage, lease)</li>
                <li>Object content-hash registry</li>
                <li>Payment dedupe after Horizon-verified XLM purchases</li>
                <li>Plan catalog (Free + Starter / Growth / Pro)</li>
                <li>storage-market contract live on Stellar Testnet</li>
              </ul>
            </div>
            <div>
              <h3>Off-chain (Evernet API + vault)</h3>
              <ul>
                <li>AES-GCM ciphertext encrypted in the browser</li>
                <li>Folders, search, trash (30-day restore), optional versioning</li>
                <li>S3-shaped HTTP API + OpenAPI (put, list, multipart, presigns, shares)</li>
                <li>API keys, project soft-cap pools, SEP-10 wallet auth</li>
                <li>Published TypeScript client: evernet-sdk on npm</li>
              </ul>
            </div>
          </div>
        </Section>

        <Section id="traction" eyebrow="Traction" title="Not a whitepaper — a working product.">
          <div className="pitch-metrics">
            <div>
              <strong>Live</strong>
              <span>Vault, docs, Labs demo</span>
            </div>
            <div>
              <strong>Testnet</strong>
              <span>Soroban storage-market</span>
            </div>
            <div>
              <strong>API + SDK</strong>
              <span>OpenAPI · evernet-sdk</span>
            </div>
            <div>
              <strong>12+</strong>
              <span>Stellar wallets via Wallets Kit</span>
            </div>
          </div>
          <ul className="pitch-checklist">
            <li>Production vault at evernet.tech — multi-wallet connect, passphrase or convenience encryption</li>
            <li>Folders, drag-and-drop, search, trash/restore, quota meter, and content-hash explorer links</li>
            <li>XLM plan purchases verified on Horizon → on-chain credit (Testnet primary; Mainnet when treasury funded)</li>
            <li>Public S3-shaped surface: multipart, ranged GET, lifecycle, soft-delete, presigns, share grants</li>
            <li>Builder stack: OpenAPI, API keys, project pools, npm evernet-sdk, encrypted-notes reference app</li>
          </ul>
          <p className="pitch-note" style={{ marginTop: '1rem' }}>
            Ecosystem partners: {partners.join(' · ')}.
          </p>
        </Section>

        <Section eyebrow="Business model" title="Capacity sold in XLM. Identity is the wallet.">
          <div className="pitch-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Plan</th>
                  <th>Capacity</th>
                  <th>Price</th>
                </tr>
              </thead>
              <tbody>
                {plans.map((plan) => (
                  <tr key={plan.name}>
                    <td>{plan.name}</td>
                    <td>{plan.capacity}</td>
                    <td>{plan.price}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="pitch-note">
            Free tier anchors activation (5 GB with every wallet). Paid leases extend quota after Horizon
            settlement — no cards, no custom token. Revenue today is capacity sold in native XLM; developer
            surface (API keys, project pools, SDK) drives app attach. Future upside: node incentives,
            enterprise SLA tiers, and compliance options for regulated builders.
          </p>
        </Section>

        <Section eyebrow="Why now" title="Stellar’s next chapter needs data, not just settlement.">
          <div className="pitch-grid two">
            <article>
              <h3>Financial inclusion</h3>
              <p>
                Credentials, remittance receipts, and identity docs need cheap, user-owned storage — not another
                SaaS silo.
              </p>
            </article>
            <article>
              <h3>Soroban maturity</h3>
              <p>
                Smart contracts can finally host the control plane: leases, quotas, and verifiable object
                registration — already running on Testnet.
              </p>
            </article>
            <article>
              <h3>Wallet distribution</h3>
              <p>
                LOBSTR, Freighter, xBull and others already hold users. Evernet rides that distribution instead
                of fighting it.
              </p>
            </article>
            <article>
              <h3>Builder demand</h3>
              <p>
                dApps on Stellar still outsource blobs. A live vault + S3-shaped API + SDK is the unlock grants
                and ventures can fund against.
              </p>
            </article>
          </div>
        </Section>

        <Section eyebrow="Go-to-market" title="Ship utility first. Expand the mesh second.">
          <ol className="pitch-steps">
            <li>
              <strong>Product-led Stellar wedge (shipping)</strong> — wallet vault, XLM checkout, docs, OpenAPI,
              evernet-sdk, and Labs demos builders can feel in minutes.
            </li>
            <li>
              <strong>Ecosystem partnerships</strong> — grow usage with Stellar apps, finance and storage partners
              (e.g. SigeaCloud, Obsideo, Peridot), and identity / document workflows.
            </li>
            <li>
              <strong>Developer surface</strong> — deepen the SDK, grants, and reference apps (media, credentials,
              signed records) so Evernet is the default storage import.
            </li>
            <li>
              <strong>Decentralize the data plane</strong> — grow from API-backed durability (Vercel Blob today)
              to a broader node mesh with stronger retrievability guarantees.
            </li>
          </ol>
        </Section>

        <Section eyebrow="Roadmap" title="From live Testnet product to Mainnet data layer.">
          <div className="pitch-roadmap">
            <div>
              <span>Now</span>
              <p>
                Live vault, S3-shaped API, XLM plans, Testnet Soroban control plane, multi-wallet UX, and
                published evernet-sdk.
              </p>
            </div>
            <div>
              <span>Next</span>
              <p>
                Mainnet storage-market deploy, production control-plane hardening, security audits, and partner
                app rollouts.
              </p>
            </div>
            <div>
              <span>Then</span>
              <p>
                Distributed data plane and durability proofs; compliance-friendly audit logs and GDPR/MiCA-oriented
                options.
              </p>
            </div>
            <div>
              <span>Beyond</span>
              <p>
                Node incentives, production SLAs for regulated builders, and Evernet as the default data layer for
                Stellar finance, identity, and archival.
              </p>
            </div>
          </div>
        </Section>

        <Section eyebrow="Use of funds" title="Capital concentrated where moat compounds.">
          <div className="pitch-funds">
            {[
              { label: 'Engineering & Stellar/Soroban', pct: 50 },
              { label: 'Security audits & testing', pct: 20 },
              { label: 'Developer tools & docs', pct: 15 },
              { label: 'Testnet incentives & community', pct: 10 },
              { label: 'Ops & reporting', pct: 5 },
            ].map((row) => (
              <div key={row.label} className="pitch-fund-row">
                <div className="pitch-fund-top">
                  <span>{row.label}</span>
                  <strong>{row.pct}%</strong>
                </div>
                <div className="pitch-fund-track">
                  <motion.div
                    className="pitch-fund-fill"
                    initial={reduce ? false : { width: 0 }}
                    whileInView={{ width: `${row.pct}%` }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section
          id="ask"
          eyebrow="The ask"
          title="Partner with us to make storage native to Stellar."
          lead="We’re raising to harden the protocol for Mainnet, complete audits, expand the data plane, and put Evernet in more Stellar builders’ and end users’ hands — with a live product already demonstrating the full loop."
        >
          <div className="pitch-ask">
            <a className="pitch-btn primary" href="mailto:hello@evernet.tech?subject=Evernet%20investor%20brief">
              Request a conversation
            </a>
            <a className="pitch-btn ghost" href="https://evernet.tech" target="_blank" rel="noreferrer">
              evernet.tech
            </a>
          </div>
          <p className="pitch-note">
            Contact: <a href="mailto:hello@evernet.tech">hello@evernet.tech</a> · Product:{' '}
            <a href="https://evernet.tech/dashboard" target="_blank" rel="noreferrer">
              vault
            </a>{' '}
            · Docs:{' '}
            <a href="https://evernet.tech/docs" target="_blank" rel="noreferrer">
              /docs
            </a>{' '}
            · Labs:{' '}
            <a href="https://evernet.tech/labs/notes" target="_blank" rel="noreferrer">
              encrypted notes
            </a>{' '}
            · npm:{' '}
            <a href="https://www.npmjs.com/package/evernet-sdk" target="_blank" rel="noreferrer">
              evernet-sdk
            </a>
          </p>
        </Section>
      </main>

      <footer className="pitch-footer">
        <span>Evernet</span>
        <span>Confidential investor materials · {new Date().getFullYear()}</span>
      </footer>
    </div>
  )
}
