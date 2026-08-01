# Evernet

Decentralized, wallet-linked storage for Stellar — marketing site + vault dashboard + Soroban control plane + storage API.

Live: [evernet.tech](https://evernet.tech) · API: [evernet-storage-api.vercel.app](https://evernet-storage-api.vercel.app) · Docs: [evernet.tech/docs#api](https://evernet.tech/docs#api)

## Developer API

Public HTTP API for wallet-linked encrypted object storage (same surface as the vault):

| Resource | URL |
|----------|-----|
| Base | `https://evernet-storage-api.vercel.app` |
| OpenAPI | [`/openapi.json`](https://evernet-storage-api.vercel.app/openapi.json) |
| Human docs | [evernet.tech/docs#api](https://evernet.tech/docs#api) |
| Health | [`/health`](https://evernet-storage-api.vercel.app/health) |

Auth: SEP-10 style challenge → JWT Bearer, or API keys (`evn_live_…`) for servers. Prefer server-side calls from third-party apps (browser CORS is limited to Evernet / localhost / Vercel previews).

**SDK:** [`sdk/`](sdk/) (`evernet-sdk` on npm) — vault helpers plus S3-shaped `s3Put` / `s3MultipartPut` / `s3Presign`.

**Cloud surface:** [`/s3/v1`](https://evernet-storage-api.vercel.app/s3/v1) — key/prefix list, multipart (≤1 GB), ranged GET, HEAD/copy, presigned downloads, revocable share grants.

```bash
npm run sdk:build
npm run sdk:example -- https://evernet-storage-api.vercel.app
# publish: cd sdk && npm publish
```

**Reference app:** [evernet.tech/labs/notes](https://evernet.tech/labs/notes) — encrypted notes on the SDK.

## Architecture

| Layer | Role |
|-------|------|
| **Any Stellar wallet** | User identity (`G…` address), via [Stellar Wallets Kit](https://stellarwalletskit.dev/) |
| **Soroban `storage-market`** | On-chain profile: quota, used bytes, lease, object registrations, payment dedupe |
| **Storage API** | SEP-10 / API-key auth, blob store, folders, projects, Horizon → `credit_purchase` |
| **Dashboard + Labs** | Vault UI, passphrase unlock, XLM plans, API keys; `/labs/notes` SDK demo |
| **evernet-sdk** | Published npm client (`encryptAndUpload`, folders, keys, projects) |

Stellar does **not** store file bytes. It stores the control plane (who paid, how much quota, which content hashes). Ciphertext lives on the Evernet storage API, keyed by wallet.

### Deployed Testnet contract

- **Contract ID:** `CBWJEDHDK2UBMF4UXLWIANQ3I6CZ4IRFZPSS2257GZL53TD46LNLEQGO`
- **Lab:** https://lab.stellar.org/r/testnet/contract/CBWJEDHDK2UBMF4UXLWIANQ3I6CZ4IRFZPSS2257GZL53TD46LNLEQGO
- Details: [`contracts/deployed-testnet.json`](contracts/deployed-testnet.json)

## Develop

```bash
# Terminal 1 — storage API
npm run api

# Terminal 2 — web app
cp .env.example .env   # points at local or remote API
npm install
npm run dev
```

Open `http://localhost:5173/dashboard`, connect a wallet (Testnet), sign the auth challenge, then upload or buy storage.

Smoke-test the API end to end (challenge → upload → download → delete) with a throwaway keypair:

```bash
cd storage-api && npx tsx src/scripts/smoke-auth.ts https://evernet-storage-api.vercel.app
```

### Contract build / redeploy

```bash
export PATH="$HOME/.cargo/bin:$PATH"
npm run contract:build
cd contracts
stellar contract deploy \
  --wasm target/wasm32v1-none/release/storage_market.wasm \
  --source-account $STELLAR_ADMIN_SECRET \
  --network testnet
stellar contract invoke --id $CONTRACT_ID --source-account $STELLAR_ADMIN_SECRET --network testnet -- \
  initialize --admin $ADMIN_PUBLIC
```

## Storage plans (XLM → Soroban credit)

| Plan | Capacity | Price |
|------|----------|-------|
| Starter | +10 GB | 5 XLM |
| Growth | +50 GB | 20 XLM |
| Pro | +200 GB | 60 XLM |

Flow: wallet pays treasury → API verifies on Horizon → admin invokes `credit_purchase` on Soroban → dashboard quota updates for that wallet on any browser.

## Wallets

The connect dialog is driven by the Stellar Wallets Kit, so Freighter, LOBSTR, xBull, Albedo, Rabet, Hana, Klever, OneKey, Bitget, Fordefi, Cactus Link and D'CENT all work out of the box.

Mobile browsers cannot load extensions, so an extension-only wallet is invisible on a phone. Users should either open evernet.tech inside their wallet's in-app browser, or pick a wallet that authorises over a link (LOBSTR, xBull PWA, Albedo). Setting `VITE_WALLETCONNECT_PROJECT_ID` additionally enables WalletConnect QR pairing; leaving it empty keeps that dependency out of the bundle.

Auth is a SEP-10 style challenge rather than `signMessage`, because only a subset of wallets implement arbitrary message signing. The API returns a sequence-0 transaction with a random nonce and 5-minute timebounds, signed by a server key derived from `API_JWT_SECRET`; the wallet counter-signs and the API verifies both signatures. The transaction can never be submitted, so signing it moves no funds.

## Repo layout

```
contracts/storage-market/   Soroban Rust contract
storage-api/                Express API (local + Vercel)
sdk/                        evernet-sdk (npm)
src/                        Vite React site, vault, docs, labs
```

## Env

**Web (`VITE_*`):** see `.env.example`  
**API:** see `storage-api/.env.example` (`STELLAR_ADMIN_SECRET`, `STORAGE_CONTRACT_ID`, …)

## Persistence

Serverless instances get a fresh `/tmp` on every request, so the API selects a storage driver at boot:

- `BLOB_READ_WRITE_TOKEN` set → **Vercel Blob** (production default)
- otherwise → **local disk** under `storage-api/data` (development)

`GET /health` reports which driver is active. Object metadata and blob pathnames are salted with an HMAC of `API_JWT_SECRET` so they can't be enumerated from the public blob host. Alternatively run `storage-api` on a box with a real volume (`Dockerfile` + `fly.toml` included) and point `VITE_STORAGE_API_URL` at it. On-chain quota/hashes remain on Soroban either way.

## Security (v1)

- Client-side AES-GCM before upload; vault prompts for a personal passphrase (recommended) or wallet-derived convenience mode
- API auth via SEP-10 style challenge JWT and/or `evn_live_…` API keys (optional project soft caps)
- Payment hashes cannot be credited twice (`Payment` entries on-chain + API mirror)
- Internal blob locators (`blobRef`) are never returned to API clients
- CORS allows evernet.tech, Vercel previews and localhost; anything else is rejected
