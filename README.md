# Evernet Website

Public marketing site for **Evernet** — a decentralized, encrypted data storage network designed for deep Stellar integration.

Built from the Evernet Business Strategy Document (July 2026 / Stellar Blockchain Grant Fund application).

## Stack

- Vite + React + TypeScript
- Framer Motion for section reveals and hero motion
- Canvas-based network hero visual
- Stellar payments via `@stellar/stellar-sdk` + Freighter wallet

## Develop

```bash
npm install
cp .env.example .env
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## Routes

- `/` — marketing site from the business strategy document
- `/dashboard` — browser vault + **Buy storage with XLM** on Stellar

## Stellar storage payments

Users connect [Freighter](https://freighter.app), pick a plan, and sign a native **XLM** payment to the Evernet treasury. After Horizon confirms the tx, vault quota increases.

| Plan    | Capacity | Price |
|---------|----------|-------|
| Starter | +10 GB   | 5 XLM |
| Growth  | +50 GB   | 20 XLM |
| Pro     | +200 GB  | 60 XLM |

### Config

```env
VITE_STELLAR_NETWORK=testnet   # or public
VITE_STELLAR_RECEIVER=G...     # treasury public key
```

- **Testnet (default):** treasury can be auto-funded via Friendbot on first purchase.
- **Mainnet:** fund the treasury account with XLM first, set Freighter to Public Network, set `VITE_STELLAR_NETWORK=public`.

Keep the treasury secret key offline (see `.treasury-secret.local` locally — never commit it).

## Content

Sections cover problem/market need, product overview, go-to-market strategy, Stellar alignment, technical integration plan, roadmap milestones, and grant fund allocation.
