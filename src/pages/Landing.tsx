import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { NetworkCanvas } from '../components/NetworkCanvas'

const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  visible: { opacity: 1, y: 0 },
}

function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode
  className?: string
  delay?: number
}) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      className={className}
      variants={fadeUp}
      initial={reduce ? false : 'hidden'}
      whileInView="visible"
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1], delay }}
    >
      {children}
    </motion.div>
  )
}

const problems = [
  {
    title: 'Centralized risk',
    body: 'Cloud giants dominate storage but introduce censorship, breaches, vendor lock-in, and rising costs.',
  },
  {
    title: 'Wallet-native gap',
    body: 'Most storage still asks for accounts and cards — not a Stellar address and a signature.',
  },
  {
    title: 'Missing Stellar layer',
    body: 'Stellar excels at payments and asset issuance — but lacks a native object-storage rail for dApps and vaults.',
  },
  {
    title: 'Emerging market demand',
    body: 'Financial inclusion initiatives generate growing volumes of documents, credentials, and digital records.',
  },
]

const features = [
  {
    label: 'Wallet identity',
    body: 'Connect with Freighter, LOBSTR, Albedo, and other Stellar wallets. SEP-10 challenge signing issues a short-lived session — no passwords.',
  },
  {
    label: 'Encrypted vault',
    body: 'Client-side AES-GCM encryption, folders, search, trash with 30-day restore, and optional object versioning.',
  },
  {
    label: 'Pay in XLM',
    body: '5 GB free tier, then Starter / Growth / Pro plans settled in native XLM. Soroban tracks quota and content hashes on Testnet.',
  },
  {
    label: 'S3-shaped API',
    body: 'HTTP /s3/v1 with list, put, ranged GET, multipart, lifecycle rules, soft-delete, presigned downloads, and revocable share grants.',
  },
  {
    label: 'Builder SDK',
    body: 'evernet-sdk on npm — encrypt-and-upload, API keys, project pools, versioning, and lifecycle helpers for apps.',
  },
]

const liveNow = [
  'Wallet vault at evernet.tech — folders, drag-and-drop, quota meter, passphrase or convenience encryption.',
  'Public storage API with OpenAPI, soft-delete trash, batch delete, versioning, and lifecycle.',
  'Soroban storage-market on Stellar Testnet for leases, quota, and content-hash registration.',
  'XLM plan purchases verified on Horizon; Labs encrypted-notes demo at /labs/notes.',
  'Published evernet-sdk (npm) for TypeScript apps and partner integrations.',
]

const nextUp = [
  'Mainnet storage-market contract and production control plane.',
  'Distributed data plane with stronger durability guarantees beyond the current blob backend.',
  'Compliance-friendly audit logs and GDPR/MiCA-oriented options for regulated use cases.',
  'Deeper ecosystem demos — identity vaults, media, and document workflows on Stellar.',
]

const strategy = [
  {
    title: 'Stellar-first payments',
    body: 'Native XLM for capacity today; Soroban leasing and escrow as the on-chain control plane expands to Mainnet.',
  },
  {
    title: 'Ecosystem partnerships',
    body: 'Ship with storage, finance, and product teams — SigeaCloud, Obsideo, and builders across Stellar.',
  },
  {
    title: 'Developer surface',
    body: 'Docs, OpenAPI, evernet-sdk, API keys, and grants so apps can store encrypted objects without standing up their own stack.',
  },
  {
    title: 'Community utility',
    body: 'Real vault usage, storage bounties, and partner apps that make wallet-linked storage the default habit.',
  },
]

const alignment = [
  {
    title: 'Financial inclusion',
    body: 'Low-cost storage helps underbanked users securely manage digital assets and records.',
  },
  {
    title: 'Interoperability & utility',
    body: 'Adds persistent object storage beyond Stellar’s payment rails — same wallets, same signatures.',
  },
  {
    title: 'Developer empowerment',
    body: 'HTTP API + SDK that accelerate dApps on Stellar and Soroban without reinventing auth or encryption.',
  },
  {
    title: 'Open ecosystem',
    body: 'Censorship-resistant, user-owned infrastructure aligned with Stellar’s open network philosophy.',
  },
  {
    title: 'Sustainability',
    body: 'Control plane on Stellar; object bytes stay off-chain — efficient design versus proof-of-work-heavy alternatives.',
  },
]

const milestones = [
  { q: 'Now', body: 'Live vault, S3-shaped API, XLM plans, Testnet Soroban control plane, and evernet-sdk.' },
  { q: 'Next', body: 'Mainnet contract deploy, production hardening, and partner app rollouts.' },
  { q: 'Then', body: 'Distributed data plane, stronger durability proofs, and compliance tooling.' },
  { q: 'Beyond', body: 'Evernet as the default data layer for Stellar finance, identity, and archival apps.' },
]

const plans = [
  { label: 'Free', detail: '5 GB included with every wallet' },
  { label: 'Starter', detail: '+10 GB · 5 XLM' },
  { label: 'Growth', detail: '+50 GB · 20 XLM' },
  { label: 'Pro', detail: '+200 GB · 60 XLM' },
]

const partners = [
  {
    name: 'SigeaCloud',
    href: 'https://sigeacloud.io',
    logo: '/partners/sigeacloud.png',
    blurb: 'Intuitive web & mobile storage experiences',
  },
  {
    name: 'Obsideo',
    href: 'https://obsideo.io',
    logo: '/partners/obsideo.png',
    blurb: 'Storage distribution & network reach',
  },
  {
    name: 'Era Digitalis',
    href: 'https://eradigitalis.de',
    logo: '/partners/eradigitalis.svg',
    blurb: 'Digital infrastructure & services',
  },
  {
    name: 'Peridot',
    href: 'https://peridot.finance',
    logo: '/partners/peridot.png',
    blurb: 'On-chain finance on Stellar and beyond',
  },
  {
    name: 'Indikin',
    href: 'https://indikin.online',
    logo: '/partners/indikin.png',
    blurb: 'Community platforms & digital products',
  },
] as const

export default function Landing() {
  const reduce = useReducedMotion()

  return (
    <div className="site">
      <header className="nav">
        <div className="container nav-inner">
          <a className="nav-brand" href="#top">
            Evernet
          </a>
          <nav className="nav-links" aria-label="Primary">
            <a href="#solution">Product</a>
            <a href="#partners">Partners</a>
            <a href="#strategy">Strategy</a>
            <a href="#stellar">Stellar</a>
            <Link to="/docs">Docs</Link>
            <Link className="nav-cta" to="/dashboard">
              Open vault
            </Link>
          </nav>
        </div>
      </header>

      <section className="hero" id="top">
        <div className="hero-visual">
          <NetworkCanvas />
        </div>
        <div className="hero-scrim" />
        <div className="container hero-content">
          <motion.p
            className="hero-brand"
            initial={reduce ? false : { opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          >
            Evernet
          </motion.p>
          <motion.h1
            initial={reduce ? false : { opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
          >
            Decentralized storage built for Stellar.
          </motion.h1>
          <motion.p
            className="hero-lead"
            initial={reduce ? false : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.75, delay: 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            Wallet-linked, client-encrypted object storage — open the vault or call the API, and pay for capacity in XLM.
          </motion.p>
          <motion.div
            className="hero-actions"
            initial={reduce ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            <Link className="btn btn-primary" to="/dashboard">
              Open storage vault
            </Link>
            <Link className="btn btn-ghost" to="/docs">
              Read the docs
            </Link>
          </motion.div>
        </div>
      </section>

      <section className="section problem" id="problem">
        <div className="container">
          <Reveal className="section-head">
            <p className="eyebrow">The gap</p>
            <h2>Storage that matches Stellar’s ambition.</h2>
            <p>
              Centralized clouds create risk. Most decentralized alternatives ignore Stellar wallets and XLM.
              Evernet closes both gaps with a vault and API you can use today.
            </p>
          </Reveal>
          <div className="problem-grid">
            {problems.map((item, i) => (
              <Reveal key={item.title} className="problem-item" delay={i * 0.06}>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="section solution" id="solution">
        <div className="container">
          <Reveal className="section-head">
            <p className="eyebrow">Product</p>
            <h2>S3-shaped. Encrypted. Wallet-native.</h2>
            <p>
              A live vault, public HTTP API, and npm SDK — Stellar addresses for identity, XLM for capacity,
              bytes encrypted before they leave the client.
            </p>
          </Reveal>
          <Reveal>
            <div className="feature-list">
              {features.map((f) => (
                <div className="feature-row" key={f.label}>
                  <strong>{f.label}</strong>
                  <p>{f.body}</p>
                </div>
              ))}
            </div>
            <p className="diff-line">
              Stellar is the control plane (auth, quota, content hashes). Object bytes stay off-chain —
              fast to serve, simple to integrate, ready for a distributed data plane next.
            </p>
          </Reveal>
        </div>
      </section>

      <section className="section" id="live">
        <div className="container">
          <Reveal className="section-head">
            <p className="eyebrow">Live today</p>
            <h2>Ship against a working stack.</h2>
            <p>
              Testnet control plane and production vault/API surface — not a whitepaper demo.
            </p>
          </Reveal>
          <div className="tech-list">
            {liveNow.map((item, i) => (
              <Reveal key={item} className="tech-item" delay={i * 0.05}>
                <span className="tech-marker" aria-hidden="true">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <p>{item}</p>
              </Reveal>
            ))}
          </div>
          <Reveal>
            <div className="markets-strip" aria-label="Quick links" style={{ marginTop: '2rem' }}>
              <Link to="/dashboard">Open vault</Link>
              <Link to="/docs">Docs &amp; OpenAPI</Link>
              <Link to="/labs/notes">Labs · encrypted notes</Link>
              <a href="https://www.npmjs.com/package/evernet-sdk" target="_blank" rel="noreferrer">
                npm i evernet-sdk
              </a>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="section partners" id="partners">
        <div className="container">
          <Reveal className="section-head">
            <p className="eyebrow">Partners</p>
            <h2>Building with teams across the ecosystem.</h2>
            <p>
              Evernet collaborates with storage, finance, and digital product partners who share the goal of
              wallet-native, user-owned infrastructure.
            </p>
          </Reveal>
          <div className="partners-grid" role="list">
            {partners.map((partner, i) => (
              <Reveal key={partner.name} delay={i * 0.05}>
                <a
                  className="partner-link"
                  href={partner.href}
                  target="_blank"
                  rel="noreferrer"
                  role="listitem"
                >
                  <span className="partner-logo-wrap" aria-hidden="true">
                    <img src={partner.logo} alt="" className="partner-logo" loading="lazy" />
                  </span>
                  <span className="partner-meta">
                    <strong>{partner.name}</strong>
                    <span>{partner.blurb}</span>
                  </span>
                </a>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="section" id="strategy">
        <div className="container">
          <Reveal className="section-head">
            <p className="eyebrow">Go-to-market</p>
            <h2>Become the preferred data layer for Stellar.</h2>
            <p>
              Powering finance, identity, supply chain, and Web3 applications with sovereign storage.
            </p>
          </Reveal>
          <Reveal>
            <div className="markets-strip" aria-label="Target markets">
              <span>Stellar developers</span>
              <span>Emerging markets</span>
              <span>Enterprises</span>
              <span>NFT &amp; archival</span>
            </div>
          </Reveal>
          <div className="strategy-steps" style={{ marginTop: '2rem' }}>
            {strategy.map((step, i) => (
              <Reveal key={step.title} className="strategy-step" delay={i * 0.05}>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="section stellar" id="stellar">
        <div className="container">
          <Reveal className="section-head">
            <p className="eyebrow">Stellar alignment</p>
            <h2>Built to advance financial inclusion.</h2>
            <p>
              Wallet auth, XLM capacity, and Soroban leases turn storage into something Stellar users already
              know how to pay for and control.
            </p>
          </Reveal>
          <Reveal>
            <ul className="align-list">
              {alignment.map((item) => (
                <li key={item.title}>
                  <span>
                    <strong>{item.title}.</strong> {item.body}
                  </span>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>

      <section className="section" id="technical">
        <div className="container">
          <Reveal className="section-head">
            <p className="eyebrow">What&apos;s next</p>
            <h2>From Testnet product to Mainnet data layer.</h2>
            <p>
              The vault and API are live. The roadmap hardens the control plane and expands the data plane.
            </p>
          </Reveal>
          <div className="tech-list">
            {nextUp.map((item, i) => (
              <Reveal key={item} className="tech-item" delay={i * 0.05}>
                <span className="tech-marker" aria-hidden="true">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <p>{item}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="section roadmap" id="roadmap">
        <div className="container">
          <Reveal className="section-head">
            <p className="eyebrow">Roadmap</p>
            <h2>Shipped first. Scale next.</h2>
            <p>
              Competitive edge: live product traction, a working Stellar integration, and a clear path to Mainnet.
            </p>
          </Reveal>
          <div className="timeline">
            {milestones.map((m, i) => (
              <Reveal key={m.q} className="timeline-item" delay={i * 0.06}>
                <span className="timeline-dot" aria-hidden="true" />
                <span className="timeline-q">{m.q}</span>
                <p>{m.body}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="section" id="pricing">
        <div className="container">
          <Reveal className="section-head">
            <p className="eyebrow">Capacity</p>
            <h2>Pay for storage the Stellar way.</h2>
            <p>
              Every wallet unlocks a free tier. Expand with XLM — no cards, no custom token required.
            </p>
          </Reveal>
          <div className="fund-bars">
            {plans.map((f, i) => (
              <Reveal key={f.label} className="fund-row" delay={i * 0.05}>
                <div className="fund-meta">
                  <span>{f.label}</span>
                  <span>{f.detail}</span>
                </div>
                <div className="fund-track">
                  <motion.div
                    className="fund-fill"
                    style={{ width: `${[35, 55, 75, 95][i]}%` }}
                    initial={reduce ? false : { scaleX: 0 }}
                    whileInView={{ scaleX: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.9, delay: 0.1 + i * 0.05, ease: [0.22, 1, 0.36, 1] }}
                  />
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal className="monetize">
            <h3>For builders</h3>
            <ul>
              <li>API keys (`evn_live_…`) and project soft-cap pools for apps</li>
              <li>Presigned downloads and revocable share grants</li>
              <li>Partner revenue paths as the node / data plane network grows</li>
            </ul>
          </Reveal>
        </div>
      </section>

      <section className="closing" id="closing">
        <div className="container">
          <Reveal>
            <p className="eyebrow" style={{ color: 'var(--foam)' }}>
              Next step
            </p>
            <h2>Expand Stellar with a missing piece: data.</h2>
            <p>
              Connect a wallet, encrypt a file, or integrate the SDK — Evernet is ready for the Stellar
              community today.
            </p>
            <div className="hero-actions">
              <Link className="btn btn-primary" to="/dashboard">
                Open storage vault
              </Link>
              <Link className="btn btn-ghost" to="/docs">
                Explore the API
              </Link>
            </div>
          </Reveal>
          <footer className="footer">
            <span>Evernet · evernet.tech · Stellar Testnet live</span>
            <span className="footer-partners">
              Partners:{' '}
              {partners.map((p, i) => (
                <span key={p.name}>
                  {i > 0 ? ' · ' : null}
                  <a href={p.href} target="_blank" rel="noreferrer">
                    {p.name}
                  </a>
                </span>
              ))}
            </span>
          </footer>
        </div>
      </section>
    </div>
  )
}
