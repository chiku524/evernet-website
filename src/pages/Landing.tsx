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
    title: 'Usability gaps',
    body: 'Existing decentralized networks often trade performance and ease-of-use for distribution.',
  },
  {
    title: 'Missing Stellar layer',
    body: 'Stellar excels at payments and asset issuance — but lacks a native, high-performance storage rail.',
  },
  {
    title: 'Emerging market demand',
    body: 'Financial inclusion initiatives generate growing volumes of documents, credentials, and digital records.',
  },
]

const features = [
  {
    label: 'Encrypted',
    body: 'End-to-end encryption with self-custodial ownership. Data is sharded across a global node network.',
  },
  {
    label: 'Proven base',
    body: 'Built on lessons from Filecoin, Storj, and Jackal Protocol, with high-performance architecture from Nunchi.',
  },
  {
    label: 'Live apps',
    body: 'Obsideo.io for storage distribution and SigeaCloud.io for intuitive web and mobile experiences.',
  },
  {
    label: 'Hybrid speed',
    body: 'Datacenter-speed access with distributed resilience and proof-of-retrievability.',
  },
  {
    label: 'Multi-chain',
    body: 'Designed for IBC and data outposts — interoperable across ecosystems, optimized for Stellar.',
  },
]

const strategy = [
  {
    title: 'Stellar integration',
    body: 'Enable XLM and Stellar asset payments, Soroban contracts for leasing and escrow, and data availability oracles.',
  },
  {
    title: 'Ecosystem partnerships',
    body: 'Expand collaboration with projects like Tanjira on Gno.land and new Stellar-based initiatives.',
  },
  {
    title: 'Developer tools',
    body: 'Ship SDKs, documentation, and grants for builders on Evernet + Stellar.',
  },
  {
    title: 'Community adoption',
    body: 'Drive real utility through airdrops, storage bounties, and focused marketing.',
  },
  {
    title: 'Mainnet roadmap',
    body: 'Testnet expansion → security audits → mainnet launch within ~12 months.',
  },
]

const alignment = [
  {
    title: 'Financial inclusion',
    body: 'Low-cost storage helps underbanked users securely manage digital assets and records.',
  },
  {
    title: 'Interoperability & utility',
    body: 'Adds persistent decentralized storage beyond Stellar’s payment rails.',
  },
  {
    title: 'Developer empowerment',
    body: 'Easy tools that accelerate dApp development on Stellar and Soroban.',
  },
  {
    title: 'Open ecosystem',
    body: 'Censorship-resistant infrastructure aligned with Stellar’s open network philosophy.',
  },
  {
    title: 'Sustainability',
    body: 'Efficient design minimizes waste versus proof-of-work-heavy alternatives.',
  },
]

const techPlan = [
  'Implement Stellar asset payments (XLM and custom tokens) for storage reservations.',
  'Develop Soroban smart contracts for storage markets, renewals, and disputes.',
  'Create bridges and oracles for cross-chain data referencing (Stellar ↔ Evernet).',
  'Build demo dApps — document signing, media streaming, identity vaults.',
  'Ship compliance-friendly options: GDPR/MiCA support and audit logs for regulated use cases.',
]

const milestones = [
  { q: 'Q1', body: 'Soroban payment contracts and basic Stellar integration.' },
  { q: 'Q2', body: 'End-to-end demo applications and testnet launch.' },
  { q: 'Q3', body: 'Audits, optimizations, and public documentation.' },
  { q: 'Q4', body: 'Mainnet readiness with Stellar as a primary payment rail.' },
]

const funding = [
  { label: 'Engineering & Stellar/Soroban integration', pct: 50 },
  { label: 'Security audits and testing', pct: 20 },
  { label: 'Developer tools, SDKs, and documentation', pct: 15 },
  { label: 'Testnet incentives and community programs', pct: 10 },
  { label: 'Project management and reporting', pct: 5 },
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
            Secure, scalable, user-owned cloud infrastructure — with tokenized payments and global access.
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
            <a className="btn btn-ghost" href="#solution">
              Explore the network
            </a>
          </motion.div>
        </div>
      </section>

      <section className="section problem" id="problem">
        <div className="container">
          <Reveal className="section-head">
            <p className="eyebrow">The gap</p>
            <h2>Storage that matches Stellar’s ambition.</h2>
            <p>
              Centralized clouds create risk. Decentralized alternatives often struggle with
              performance and payments. Evernet closes both gaps.
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
            <h2>S3-compatible. Encrypted. Decentralized.</h2>
            <p>
              High-performance storage with blockchain-native ownership — already live via Obsideo
              and SigeaCloud.
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
              Key differentiators: high usability for non-crypto users, enterprise-grade SLAs, and
              real-world data sovereignty.
            </p>
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
              <span>NFT & archival</span>
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
              Grant-funded Stellar integration unlocks tokenized storage payments, cross-border data
              services, and low-cost access worldwide.
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
            <p className="eyebrow">Integration plan</p>
            <h2>From payments to Soroban markets.</h2>
            <p>
              A phased technical path that pairs Evernet’s live storage stack with Stellar’s rails.
            </p>
          </Reveal>
          <div className="tech-list">
            {techPlan.map((item, i) => (
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
            <h2>Twelve months to mainnet readiness.</h2>
            <p>
              Competitive edge: live product traction, proven tech foundation, and deep Stellar
              integration.
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

      <section className="section" id="funding">
        <div className="container">
          <Reveal className="section-head">
            <p className="eyebrow">Use of funds</p>
            <h2>Grant capital that compounds the ecosystem.</h2>
            <p>
              Allocation prioritizes engineering, audits, and developer enablement for the Stellar
              community.
            </p>
          </Reveal>
          <div className="fund-bars">
            {funding.map((f, i) => (
              <Reveal key={f.label} className="fund-row" delay={i * 0.05}>
                <div className="fund-meta">
                  <span>{f.label}</span>
                  <span>{f.pct}%</span>
                </div>
                <div className="fund-track">
                  <motion.div
                    className="fund-fill"
                    style={{ width: `${f.pct}%` }}
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
            <h3>Monetization</h3>
            <ul>
              <li>Token-based storage payments and staking incentives</li>
              <li>Premium enterprise tiers and managed services</li>
              <li>Revenue sharing with node operators and ecosystem partners</li>
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
              Evernet is ready to collaborate with the Stellar community and deliver tangible utility
              worldwide.
            </p>
            <div className="hero-actions">
              <Link className="btn btn-primary" to="/dashboard">
                Open storage vault
              </Link>
              <a className="btn btn-ghost" href="https://evernet.io" target="_blank" rel="noreferrer">
                Visit Evernet.io
              </a>
            </div>
          </Reveal>
          <footer className="footer">
            <span>Evernet · Business strategy · July 2026</span>
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
