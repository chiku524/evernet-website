/**
 * Build printable PDFs from gitbook/ markdown (SUMMARY.md order).
 * Output: public/gitbook/*.pdf
 *
 * Usage: node scripts/build-gitbook-pdfs.mjs
 */
import { mkdir, readFile, writeFile, rm, access } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const gitbookDir = join(root, 'gitbook')
const outDir = join(root, 'public', 'gitbook')
const buildDir = join(root, '.gitbook-pdf-build')

const BOOKS = [
  {
    file: 'evernet-briefing.pdf',
    title: 'Evernet — Product briefing',
    paths: 'all',
  },
  {
    file: 'evernet-application.pdf',
    title: 'Evernet — Application',
    paths: [
      'README.md',
      'why-evernet.md',
      'application/overview.md',
      'application/architecture.md',
      'application/how-it-works.md',
    ],
  },
  {
    file: 'evernet-use-cases.pdf',
    title: 'Evernet — Use cases',
    paths: [
      'use-cases/README.md',
      'use-cases/rwa-capital-markets.md',
      'use-cases/anchors-stablecoins.md',
      'use-cases/digital-identity.md',
      'use-cases/enterprise-government.md',
      'use-cases/healthcare.md',
    ],
  },
  {
    file: 'evernet-services.pdf',
    title: 'Evernet — Services',
    paths: [
      'services/README.md',
      'services/vault.md',
      'services/storage-api.md',
      'services/sdk.md',
      'services/integrity-control-plane.md',
      'services/pricing.md',
    ],
  },
  {
    file: 'evernet-partners.pdf',
    title: 'Evernet — Partners & ecosystem',
    paths: [
      'partners/README.md',
      'partners/sigeacloud.md',
      'partners/obsideo.md',
      'partners/era-digitalis.md',
      'partners/peridot.md',
      'partners/indikin.md',
    ],
  },
]

function findChrome() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH && existsSync(process.env.PUPPETEER_EXECUTABLE_PATH)) {
    return process.env.PUPPETEER_EXECUTABLE_PATH
  }
  const candidates = [
    'C:\\\\Program Files\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe',
    'C:\\\\Program Files (x86)\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe',
    join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    'C:\\\\Program Files\\\\Microsoft\\\\Edge\\\\Application\\\\msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
  ]
  for (const p of candidates) {
    if (p && existsSync(p)) return p
  }
  return undefined
}

async function parseSummaryPaths() {
  const summary = await readFile(join(gitbookDir, 'SUMMARY.md'), 'utf8')
  const paths = []
  for (const line of summary.split(/\r?\n/)) {
    const m = line.match(/\*\s+\[[^\]]+\]\(([^)]+\.md)\)/)
    if (m) paths.push(m[1].replace(/^\.\//, ''))
  }
  return paths
}

function cover(title) {
  const date = new Date().toISOString().slice(0, 10)
  return `# ${title}

**Enterprise data integrity & compliance infrastructure for Stellar**

Generated from the Evernet GitBook · ${date}

- Live product: https://evernet.tech
- Markdown source: https://github.com/chiku524/evernet-website/tree/master/gitbook
- Contact: hello@evernet.tech

---

`
}

async function assembleMarkdown(paths, title) {
  const parts = [cover(title)]
  for (const rel of paths) {
    const abs = join(gitbookDir, rel)
    let body = await readFile(abs, 'utf8')
    body = body.replace(
      /\[([^\]]+)\]\((?!https?:|mailto:|#)([^)]+)\)/g,
      '$1 ($2)',
    )
    parts.push(body.trim(), '\n\n---\n\n')
  }
  return parts.join('\n')
}

async function loadMdToPdf() {
  const require = createRequire(import.meta.url)
  try {
    return require('md-to-pdf').mdToPdf
  } catch {
    // Global / npx install path
    try {
      return require(
        join(
          process.env.APPDATA || '',
          'npm',
          'node_modules',
          'md-to-pdf',
          'dist',
          'index.js',
        ),
      ).mdToPdf
    } catch {
      throw new Error('Install md-to-pdf: npm i -D md-to-pdf')
    }
  }
}

async function main() {
  const mdToPdf = await loadMdToPdf()
  const chrome = findChrome()
  if (!chrome) {
    throw new Error(
      'No Chrome/Edge found. Set PUPPETEER_EXECUTABLE_PATH or install Google Chrome.',
    )
  }
  console.log(`Using browser: ${chrome}`)

  const allPaths = await parseSummaryPaths()
  await mkdir(outDir, { recursive: true })
  await rm(buildDir, { recursive: true, force: true })
  await mkdir(buildDir, { recursive: true })

  const indexLines = [
    '# Evernet GitBook PDFs',
    '',
    'Printable briefings for reviewers and AI evaluation. Markdown source lives in [`/gitbook`](https://github.com/chiku524/evernet-website/tree/master/gitbook).',
    '',
    '| Document | Download |',
    '|----------|----------|',
  ]

  for (const book of BOOKS) {
    const paths = book.paths === 'all' ? allPaths : book.paths
    const md = await assembleMarkdown(paths, book.title)
    const mdPath = join(buildDir, book.file.replace(/\.pdf$/, '.md'))
    const pdfPath = join(outDir, book.file)
    await writeFile(mdPath, md, 'utf8')

    console.log(`Building ${book.file} (${paths.length} chapters)…`)
    const pdf = await mdToPdf(
      { path: mdPath },
      {
        dest: pdfPath,
        pdf_options: {
          format: 'A4',
          margin: { top: '20mm', right: '16mm', bottom: '20mm', left: '16mm' },
          printBackground: true,
        },
        launch_options: {
          executablePath: chrome,
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
        },
      },
    )
    if (!pdf?.filename) {
      throw new Error(`Failed to write ${book.file}`)
    }
    await access(pdfPath)
    indexLines.push(`| ${book.title} | [${book.file}](./${book.file}) |`)
  }

  indexLines.push(
    '',
    '## GitHub',
    '',
    '- Source: https://github.com/chiku524/evernet-website/tree/master/gitbook',
    '- This folder: https://github.com/chiku524/evernet-website/tree/master/public/gitbook',
    '',
  )
  await writeFile(join(outDir, 'README.md'), indexLines.join('\n'), 'utf8')
  await rm(buildDir, { recursive: true, force: true })
  console.log(`Done → ${outDir}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
