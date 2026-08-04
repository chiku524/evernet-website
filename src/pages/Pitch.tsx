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
    document.title = 'Evernet — SCF / Investor Brief'
    const robots = document.createElement('meta')
    robots.name = 'robots'
    robots.content = 'noindex, nofollow'
    document.head.appendChild(robots)
    return () => {
      document.head.removeChild(robots)
      document.title = 'Evernet — Enterprise Data Integrity for Stellar'
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
          <span>SCF / investor brief</span>
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
          <p className="pitch-hero-line">Enterprise data integrity &amp; compliance infrastructure for Stellar.</p>
          <p className="pitch-hero-sub">
            Trust, auditability, and verifiable records for enterprises and governments — powered by
            wallet-native encryption and Stellar as the integrity control plane. Storage is how we
            deliver the outcome; the product is proof that data has not been altered.
          </p>
          <div className="pitch-hero-cta">
            <a className="pitch-btn primary" href="#traction">
              See commercial traction
            </a>
            <a className="pitch-btn ghost" href="#poc">
              Stellar PoC
            </a>
          </div>
        </motion.section>

        <Section
          eyebrow="Thesis"
          title="Stellar settles value. Evernet makes the records behind that value trustworthy."
          lead="Enterprises, Anchors, RWA issuers, and stablecoin programs need more than payments — they need confidential documents, credentials, and operational records that stay intact, auditable, and compliant. Evernet is not another Filecoin for Stellar. It is the integrity layer that lets regulated builders put verifiable data workflows on Stellar without bolting on opaque cloud silos."
        />

        <Section id="problem" eyebrow="Problem" title="The real gap is trust — not disk space.">
          <div className="pitch-grid three">
            <article>
              <h3>Integrity without proof</h3>
              <p>
                Critical documents live in SaaS buckets with no portable, on-chain way to prove they
                were never modified after issuance or attestation.
              </p>
            </article>
            <article>
              <h3>Compliance vs. custody</h3>
              <p>
                Regulated industries need governance, audit trails, and client-side confidentiality —
                not another account/password silo or a UX-hostile storage token network.
              </p>
            </article>
            <article>
              <h3>Stellar apps without records</h3>
              <p>
                RWA, Anchors, identity, and enterprise apps settle on Stellar but still outsource the
                documents those assets and identities refer to — breaking the trust story.
              </p>
            </article>
          </div>
        </Section>

        <Section
          eyebrow="Positioning"
          title="Data integrity infrastructure. Encrypted storage is the delivery mechanism."
          lead="Reviewers should not ask “why does Stellar need another Filecoin?” They should ask which enterprise use cases become possible when documents can be stored privately and their cryptographic proofs anchored on Stellar."
        >
          <div className="pitch-split">
            <div>
              <h3>Core value</h3>
              <ul>
                <li>Trust &amp; non-repudiation for enterprise records</li>
                <li>Auditability via content-hash registry on Soroban</li>
                <li>Compliance-ready confidentiality (client-side AES-GCM)</li>
                <li>Wallet identity — G… address is the account</li>
                <li>Capacity settled in native XLM (no custom token)</li>
              </ul>
            </div>
            <div>
              <h3>What we unlock on Stellar</h3>
              <ul>
                <li>RWA issuers — offering docs, legal packs, attestations</li>
                <li>Stablecoin / Anchor programs — KYC packs &amp; operational records</li>
                <li>Digital identity — credentials &amp; verifiable document vaults</li>
                <li>Compliant enterprise apps — governed, auditable object workflows</li>
                <li>Governments &amp; institutions — integrity without surrendering custody</li>
              </ul>
            </div>
          </div>
        </Section>

        <Section
          eyebrow="Solution"
          title="Encrypted data plane. Stellar integrity control plane."
          lead="Bytes stay off-chain and encrypted. Stellar records who paid, how much quota they hold, and which content hashes prove an object has not changed."
        >
          <div className="pitch-split">
            <div>
              <h3>On Stellar / Soroban</h3>
              <ul>
                <li>Storage profiles per G… address (quota, usage, lease)</li>
                <li>Object content-hash registry for integrity proofs</li>
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
                <li>S3-shaped HTTP API + OpenAPI (put, list, multipart, shares)</li>
                <li>API keys, project soft-cap pools, SEP-10 wallet auth</li>
                <li>Published TypeScript client: evernet-sdk on npm</li>
              </ul>
            </div>
          </div>
        </Section>

        <Section id="traction" eyebrow="Traction" title="Commercial validation first. Product already shipping.">
          <div className="pitch-callout">
            <p className="pitch-callout-label">Strongest commercial signal</p>
            <p>
              <strong>Paid pilot with a German healthcare institution</strong> — real enterprise demand for
              confidential, integrity-preserving records in a regulated setting. This is the wedge we lead
              with: paying customers validating the integrity thesis, not a storage whitepaper.
            </p>
          </div>
          <div className="pitch-metrics">
            <div>
              <strong>Paid pilot</strong>
              <span>German healthcare</span>
            </div>
            <div>
              <strong>Live</strong>
              <span>Vault, docs, Labs demo</span>
            </div>
            <div>
              <strong>Testnet</strong>
              <span>Soroban integrity plane</span>
            </div>
            <div>
              <strong>API + SDK</strong>
              <span>OpenAPI · evernet-sdk</span>
            </div>
          </div>
          <ul className="pitch-checklist">
            <li>
              <strong>Enterprise pipeline</strong> — healthcare pilot plus regulated / institutional
              conversations where governance and auditability matter more than raw capacity pricing
            </li>
            <li>
              <strong>Ecosystem partners</strong> — {partners.join(', ')} across storage UX, finance, and
              digital infrastructure
            </li>
            <li>
              <strong>Product in production</strong> — vault at evernet.tech, multi-wallet connect, client
              encryption, folders/search/trash, XLM capacity checkout
            </li>
            <li>
              <strong>Builder surface</strong> — S3-shaped API, OpenAPI, API keys, project pools, npm
              evernet-sdk, Labs encrypted-notes reference app
            </li>
            <li>
              <strong>Market validation</strong> — free tier for activation; paid XLM leases for capacity;
              enterprise SLA / compliance tiers as the commercial expansion path
            </li>
          </ul>
        </Section>

        <Section
          id="poc"
          eyebrow="Stellar proof of concept"
          title="Complementary value beyond accepting XLM."
          lead="Because Stellar-specific commercial traction is still early, we will ship a concrete PoC that shows Evernet + Stellar enabling integrity workflows — not just payment settlement."
        >
          <div className="pitch-callout">
            <p className="pitch-callout-label">Flagship PoC</p>
            <p>
              An Anchor or RWA issuer stores offering documents and operational records in Evernet,
              anchors their cryptographic content hashes on Stellar, and later proves those documents have
              never been modified — auditable by counterparties, regulators, or investors without
              exposing plaintext.
            </p>
          </div>
          <div className="pitch-grid three">
            <article>
              <h3>1 · Store</h3>
              <p>Client-encrypt and upload documents via vault or SDK — wallet identity, no shared passwords.</p>
            </article>
            <article>
              <h3>2 · Anchor</h3>
              <p>Register content hashes on Soroban so Stellar becomes the integrity receipt layer.</p>
            </article>
            <article>
              <h3>3 · Verify</h3>
              <p>Anyone with the proof can confirm the bytes match the on-chain hash — unmodified since attestation.</p>
            </article>
          </div>
          <p className="pitch-note" style={{ marginTop: '1rem' }}>
            This demonstrates why Evernet belongs in the Stellar stack: new enterprise use cases
            (RWA, Anchors, identity, compliance) — not a parallel storage marketplace competing with Filecoin.
          </p>
        </Section>

        <Section eyebrow="Business model" title="Capacity in XLM today. Integrity products for enterprises next.">
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
            settlement — no cards, no custom token. Near-term revenue is capacity in XLM plus enterprise
            pilots; upside is compliance / SLA tiers, integrity verification workflows, and regulated
            builder programs.
          </p>
        </Section>

        <Section eyebrow="Why Stellar" title="New capabilities for the ecosystem — not storage-for-storage’s sake.">
          <div className="pitch-grid two">
            <article>
              <h3>RWA &amp; capital markets</h3>
              <p>
                Issuers need confidential offering materials with portable integrity proofs tied to
                on-chain assets.
              </p>
            </article>
            <article>
              <h3>Anchors &amp; stablecoins</h3>
              <p>
                Operational and compliance records that settle alongside payments — verifiable without
                opening a second trust domain.
              </p>
            </article>
            <article>
              <h3>Digital identity</h3>
              <p>
                Credentials and personal documents under wallet control, with auditability for
                institutions that must verify authenticity.
              </p>
            </article>
            <article>
              <h3>Enterprise &amp; government</h3>
              <p>
                Governance, retention, and non-repudiation for regulated data — validated first by our
                healthcare pilot.
              </p>
            </article>
          </div>
        </Section>

        <Section eyebrow="Go-to-market" title="Lead with paying enterprise proof. Expand Stellar use cases second.">
          <ol className="pitch-steps">
            <li>
              <strong>Commercial wedge (active)</strong> — convert the German healthcare pilot and adjacent
              regulated pipeline into referenceable case studies and paid expansions.
            </li>
            <li>
              <strong>Stellar integrity PoC</strong> — ship the Anchor / RWA store → anchor → verify loop
              so SCF and ecosystem partners can evaluate complementary value immediately.
            </li>
            <li>
              <strong>Ecosystem partnerships</strong> — grow with Stellar finance, identity, and
              infrastructure partners ({partners.slice(0, 3).join(', ')}, and peers).
            </li>
            <li>
              <strong>Developer attach</strong> — deepen SDK, grants, and reference apps so integrity
              workflows become the default import for regulated Stellar builders.
            </li>
          </ol>
        </Section>

        <Section eyebrow="Roadmap" title="Capabilities for Stellar builders — not a storage feature dump.">
          <div className="pitch-roadmap">
            <div>
              <span>Now</span>
              <p>
                Live vault + API + SDK; Testnet content-hash integrity plane; paid healthcare pilot and
                partner network.
              </p>
            </div>
            <div>
              <span>Next</span>
              <p>
                Flagship Stellar PoC (Anchor/RWA verify loop); Mainnet control plane; security audits;
                enterprise compliance tooling.
              </p>
            </div>
            <div>
              <span>Then</span>
              <p>
                Integrity workflows for RWA, Anchors, identity, and regulated apps; audit logs and
                GDPR/MiCA-oriented options.
              </p>
            </div>
            <div>
              <span>Beyond</span>
              <p>
                Default integrity layer for Stellar finance and institutional apps — with production SLAs
                and durable multi-node retrieval.
              </p>
            </div>
          </div>
        </Section>

        <Section eyebrow="Use of funds" title="Capital concentrated where ecosystem value compounds.">
          <div className="pitch-funds">
            {[
              { label: 'Engineering & Stellar integrity plane', pct: 45 },
              { label: 'Enterprise PoC, compliance & audits', pct: 25 },
              { label: 'Developer tools, SDK & reference apps', pct: 15 },
              { label: 'Ecosystem partnerships & GTM', pct: 10 },
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
          title="Partner with us to make data integrity native to Stellar."
          lead="We’re raising to harden Mainnet integrity proofs, complete audits, ship the Stellar enterprise PoC, and scale from a paying healthcare pilot into RWA, Anchor, and identity workflows — with a live product already demonstrating the full loop."
        >
          <div className="pitch-ask">
            <a className="pitch-btn primary" href="mailto:hello@evernet.tech?subject=Evernet%20SCF%20%2F%20investor%20brief">
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
        <span>Confidential SCF / investor materials · {new Date().getFullYear()}</span>
      </footer>
    </div>
  )
}
