import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { NetworkCanvas } from '../components/NetworkCanvas'
import BrandMark from '../components/BrandMark'
import { Reveal } from '../components/Reveal'
import { HowItWorks } from '../components/HowItWorks'

const problems = [
  {
    title: 'Integrity without proof',
    body: 'Critical documents live in opaque SaaS buckets with no portable way to prove they were never modified.',
  },
  {
    title: 'Compliance vs. custody',
    body: 'Enterprises need auditability and confidentiality — not another password silo or a storage-token maze.',
  },
  {
    title: 'Stellar apps without records',
    body: 'RWA, Anchors, and identity settle on Stellar but still outsource the documents those assets refer to.',
  },
  {
    title: 'Enterprise demand',
    body: 'Healthcare, finance, and government generate growing volumes of records that must stay trustworthy.',
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
  'Paid enterprise pilot with a German healthcare institution — commercial validation for regulated records.',
  'Wallet vault at evernet.tech — folders, drag-and-drop, quota meter, passphrase or convenience encryption.',
  'Public storage API with OpenAPI, soft-delete trash, batch delete, versioning, and lifecycle.',
  'Soroban integrity plane on Stellar Testnet — leases, quota, and content-hash registration.',
  'Published evernet-sdk (npm) for TypeScript apps and partner integrations.',
]

const nextUp = [
  'Stellar integrity PoC — Anchor/RWA store documents, anchor content hashes, verify unmodified.',
  'Mainnet integrity control plane and production hardening for enterprise workloads.',
  'Compliance-friendly audit logs and GDPR/MiCA-oriented options for regulated builders.',
  'Integrity workflows for RWA issuers, Anchors, digital identity, and compliant enterprise apps.',
]

const strategy = [
  {
    title: 'Enterprise integrity wedge',
    body: 'Lead with paying regulated use cases — including a paid German healthcare pilot — where trust and auditability close deals.',
  },
  {
    title: 'Stellar use-case expansion',
    body: 'Enable RWA, Anchors, stablecoin issuers, and identity apps with verifiable document workflows on Stellar.',
  },
  {
    title: 'Ecosystem partnerships',
    body: 'Ship with finance and infrastructure teams — SigeaCloud, Obsideo, Peridot, and builders across Stellar.',
  },
  {
    title: 'Developer surface',
    body: 'Docs, OpenAPI, evernet-sdk, API keys, and grants so apps can ship integrity workflows without standing up their own stack.',
  },
]

const alignment = [
  {
    title: 'New enterprise use cases',
    body: 'RWA, Anchors, stablecoins, and identity get confidential records with cryptographic proofs on Stellar — not another Filecoin clone.',
  },
  {
    title: 'Trust & auditability',
    body: 'Content hashes on Soroban turn Stellar into the integrity receipt layer for documents that must not change.',
  },
  {
    title: 'Developer empowerment',
    body: 'HTTP API + SDK that accelerate regulated apps on Stellar without reinventing auth, encryption, or verification.',
  },
  {
    title: 'Open ecosystem',
    body: 'User-owned, wallet-native infrastructure aligned with Stellar’s open network philosophy.',
  },
  {
    title: 'Efficient design',
    body: 'Integrity control plane on Stellar; encrypted object bytes stay off-chain — practical for enterprise scale.',
  },
]

const milestones = [
  { q: 'Now', body: 'Live vault + API + SDK; Testnet integrity plane; paid healthcare pilot and partner network.' },
  { q: 'Next', body: 'Stellar Anchor/RWA verify PoC, Mainnet control plane, audits, and compliance tooling.' },
  { q: 'Then', body: 'Integrity workflows for RWA, Anchors, identity, and regulated enterprise apps.' },
  { q: 'Beyond', body: 'Default integrity layer for Stellar finance, institutions, and compliant archival.' },
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
            <BrandMark className="brand-mark" size={26} />
            Evernet
          </a>
          <nav className="nav-links" aria-label="Primary">
            <a href="#solution">Product</a>
            <a href="#how-it-works">How it works</a>
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
            Data integrity infrastructure for Stellar.
          </motion.h1>
          <motion.p
            className="hero-lead"
            initial={reduce ? false : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.75, delay: 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            Trust, auditability, and client-encrypted records for enterprises — wallet identity, on-chain integrity
            proofs, capacity in XLM.
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
            <h2>Integrity that matches Stellar’s ambition.</h2>
            <p>
              Payments settle on-chain. The documents behind RWA, Anchors, and enterprise workflows still live in
              opaque clouds. Evernet closes that trust gap — live vault and API today.
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
            <h2>Encrypted records. On-chain integrity proofs.</h2>
            <p>
              A live vault, public HTTP API, and npm SDK — Stellar addresses for identity, content hashes for
              auditability, bytes encrypted before they leave the client.
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
              Stellar is the integrity control plane (auth, quota, content hashes). Encrypted object bytes stay
              off-chain — storage is the delivery mechanism; trust is the product.
            </p>
          </Reveal>
        </div>
      </section>

      <section className="section how" id="how-it-works">
        <div className="container">
          <Reveal className="section-head">
            <p className="eyebrow">How it works</p>
            <h2>From wallet signature to on-chain receipt.</h2>
            <p>
              Four steps happen behind every upload — your keys and files never leave your device unencrypted.
            </p>
          </Reveal>
          <HowItWorks />
        </div>
      </section>

      <section className="section" id="live">
        <div className="container">
          <Reveal className="section-head">
            <p className="eyebrow">Live today</p>
            <h2>Commercial traction and a working stack.</h2>
            <p>
              Paying enterprise validation plus a Testnet integrity plane and production vault/API — not a whitepaper demo.
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
            <p className="eyebrow">Partners &amp; traction</p>
            <h2>Building with teams across the ecosystem.</h2>
            <p>
              Commercial validation includes a paid pilot with a German healthcare institution, plus finance and
              infrastructure partners who need wallet-native, integrity-preserving records. Browse the{' '}
              <Link to="/gitbook">GitBook briefing pack</Link> or download the{' '}
              <a href="/gitbook/evernet-partners.pdf" target="_blank" rel="noreferrer">
                partners PDF
              </a>
              .
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
            <h2>Become the integrity layer for Stellar.</h2>
            <p>
              Powering RWA, Anchors, identity, and regulated enterprise apps with verifiable, confidential records.
            </p>
          </Reveal>
          <Reveal>
            <div className="markets-strip" aria-label="Target markets">
              <span>RWA &amp; Anchors</span>
              <span>Enterprises &amp; healthcare</span>
              <span>Digital identity</span>
              <span>Stellar builders</span>
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
            <h2>New capabilities — not another storage marketplace.</h2>
            <p>
              Wallet auth, XLM capacity, and Soroban content hashes let Stellar projects prove documents
              unchanged — complementary value beyond accepting XLM as payment.
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
            <h2>From live product to Stellar integrity workflows.</h2>
            <p>
              The vault and API are live. The roadmap ships the enterprise PoC and expands regulated use cases
              on Stellar.
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
            <h2>Shipped first. Ecosystem capabilities next.</h2>
            <p>
              Competitive edge: paid enterprise pilot, live product, working Stellar integrity plane, and a clear
              Mainnet path.
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
            <h2>Make data integrity native to Stellar.</h2>
            <p>
              Connect a wallet, encrypt a record, or integrate the SDK — Evernet is ready for enterprises and
              Stellar builders today.
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
            <span className="footer-briefing">
              Briefing:{' '}
              <Link to="/gitbook">GitBook hub</Link>
              {' · '}
              <a href="/gitbook/evernet-briefing.pdf" target="_blank" rel="noreferrer">
                Full PDF
              </a>
              {' · '}
              <a href="/gitbook/evernet-use-cases.pdf" target="_blank" rel="noreferrer">
                Use cases
              </a>
              {' · '}
              <a href="/gitbook/evernet-services.pdf" target="_blank" rel="noreferrer">
                Services
              </a>
              {' · '}
              <a href="/gitbook/evernet-partners.pdf" target="_blank" rel="noreferrer">
                Partners
              </a>
            </span>
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
