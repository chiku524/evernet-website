# Evernet

Decentralized, wallet-linked storage for Stellar — marketing site + vault dashboard + Soroban control plane + storage API.

Live: [evernet.tech](https://evernet.tech) · API: [evernet-storage-api.vercel.app](https://evernet-storage-api.vercel.app)

## Architecture

| Layer | Role |
|-------|------|
| **Freighter wallet** | User identity (`G…` address) |
| **Soroban `storage-market`** | On-chain profile: quota, used bytes, lease, object registrations, payment dedupe |
| **Storage API** | Challenge auth, encrypted blob store, Horizon payment verify → `credit_purchase` |
| **Dashboard** | Connect wallet, buy XLM plans, encrypt/upload/download |

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

Open `http://localhost:5173/dashboard`, connect Freighter (Testnet), sign the auth challenge, then upload or buy storage.

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

Flow: Freighter pays treasury → API verifies on Horizon → admin invokes `credit_purchase` on Soroban → dashboard quota updates for that wallet on any browser.

## Repo layout

```
contracts/storage-market/   Soroban Rust contract
storage-api/                Express API (local + Vercel)
src/                        Vite React site + dashboard
```

## Env

**Web (`VITE_*`):** see `.env.example`  
**API:** see `storage-api/.env.example` (`STELLAR_ADMIN_SECRET`, `STORAGE_CONTRACT_ID`, …)

## Persistence note

The Vercel-hosted API uses ephemeral disk for blobs (fine for demos). For durable node storage, run `storage-api` with a volume (`Dockerfile` + `fly.toml` included) and point `VITE_STORAGE_API_URL` at it. On-chain quota/hashes remain on Soroban either way.

## Security (v1)

- Client-side AES-GCM before upload (key derived from wallet address passphrase helper — replace with user passphrase for production)
- API auth via Freighter `signMessage` challenge
- Payment hashes cannot be credited twice (`Payment` entries on-chain + API mirror)
