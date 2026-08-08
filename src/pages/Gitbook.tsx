import { Link } from 'react-router-dom'
import BrandMark from '../components/BrandMark'

const PDFS: {
  href: string
  title: string
  blurb: string
  primary?: boolean
}[] = [
  {
    href: '/gitbook/evernet-briefing.pdf',
    title: 'Full product briefing',
    blurb: 'Complete GitBook in one PDF — product, use cases, services, partners, roadmap.',
    primary: true,
  },
  {
    href: '/gitbook/evernet-application.pdf',
    title: 'Application',
    blurb: 'What Evernet is, architecture, and how the integrity loop works.',
  },
  {
    href: '/gitbook/evernet-use-cases.pdf',
    title: 'Use cases',
    blurb: 'RWA, Anchors, identity, enterprise, government, and healthcare.',
  },
  {
    href: '/gitbook/evernet-services.pdf',
    title: 'Services',
    blurb: 'Vault, Storage API, SDK, Soroban control plane, and XLM pricing.',
  },
  {
    href: '/gitbook/evernet-partners.pdf',
    title: 'Partners & ecosystem',
    blurb: 'SigeaCloud, Obsideo, Era Digitalis, Peridot, and Indikin.',
  },
]

export default function Gitbook() {
  return (
    <div className="gitbook-page">
      <header className="labs-top">
        <div className="container labs-top-inner">
          <Link to="/" className="labs-brand">
            <BrandMark className="brand-mark" size={24} />
            Evernet
          </Link>
          <nav className="labs-nav">
            <Link to="/docs">Docs</Link>
            <Link to="/dashboard">Vault</Link>
            <a
              href="https://github.com/chiku524/evernet-website/tree/master/gitbook"
              target="_blank"
              rel="noreferrer"
            >
              Markdown source
            </a>
          </nav>
        </div>
      </header>

      <main className="container gitbook-main">
        <p className="eyebrow">Briefing pack</p>
        <h1>GitBook PDFs</h1>
        <p className="labs-lead">
          Printable briefings for reviewers and AI evaluation — product overview, use cases, services, and
          partners. Pick a section PDF or download the full briefing.
        </p>

        <ul className="gitbook-list" role="list">
          {PDFS.map((doc) => (
            <li key={doc.href} className={doc.primary ? 'gitbook-item primary' : 'gitbook-item'}>
              <div className="gitbook-item-copy">
                {doc.primary ? <p className="gitbook-eyebrow">Start here</p> : null}
                <h2>{doc.title}</h2>
                <p>{doc.blurb}</p>
              </div>
              <a
                className={doc.primary ? 'dash-btn primary' : 'dash-btn ghost'}
                href={doc.href}
                target="_blank"
                rel="noreferrer"
              >
                Open PDF
              </a>
            </li>
          ))}
        </ul>

        <p className="gitbook-footnote">
          Markdown source on{' '}
          <a
            href="https://github.com/chiku524/evernet-website/tree/master/gitbook"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
          {' · '}
          Live product at <Link to="/">evernet.tech</Link>
          {' · '}
          <Link to="/docs">Developer docs</Link>
        </p>
      </main>
    </div>
  )
}
