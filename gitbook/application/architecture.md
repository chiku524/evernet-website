# Architecture

## Layered model

| Layer | Role |
|-------|------|
| **Any Stellar wallet** | User identity (`G…`) via Stellar Wallets Kit |
| **Soroban `storage-market`** | On-chain profile: quota, used bytes, lease, object registrations, payment dedupe |
| **Storage API** | SEP-10 / API-key auth, blob store, folders, projects, Horizon → `credit_purchase` |
| **Dashboard + Labs** | Vault UI, passphrase unlock, XLM plans, API keys; `/labs/notes` demo |
| **evernet-sdk** | npm client (`encryptAndUpload`, folders, keys, projects, S3 helpers) |

**Critical principle:** Stellar does **not** store file bytes. It stores the control plane (who paid, how much quota, which content hashes). Ciphertext lives on the Evernet storage API, keyed by wallet.

```
┌─────────────────┐     SEP-10 challenge      ┌──────────────────┐
│  Stellar wallet │ ───────────────────────►  │   Storage API    │
│  (identity)     │ ◄──── JWT / API key ───── │  (ciphertext)    │
└─────────────────┘                           └────────┬─────────┘
                                                       │
                       content hash + quota            │
                              ▼                        │
                    ┌──────────────────┐               │
                    │ Soroban contract │ ◄─────────────┘
                    │ storage-market   │   credit_purchase / register
                    └──────────────────┘
```

## Repository layout

```
contracts/storage-market/   Soroban Rust contract
storage-api/                Express API (local + Vercel)
sdk/                        evernet-sdk (npm)
src/                        Vite React site, vault, docs, labs
```

## Auth model

1. Client requests a SEP-10-style challenge (sequence-0 transaction with nonce + timebounds).
2. Wallet counter-signs; the transaction is **never submitted** — signing moves no funds.
3. API verifies signatures and issues a short-lived JWT (~24h).
4. Server apps can use API keys (`evn_live_…`) instead of interactive wallet auth.

## Persistence

- Production: **Vercel Blob** when `BLOB_READ_WRITE_TOKEN` is set.
- Local / fallback: disk under a configured directory.

## Deployed Testnet contract

| Field | Value |
|-------|-------|
| Contract ID | `CBWJEDHDK2UBMF4UXLWIANQ3I6CZ4IRFZPSS2257GZL53TD46LNLEQGO` |
| Network | Stellar Testnet |
| Lab | [View on Stellar Lab](https://lab.stellar.org/r/testnet/contract/CBWJEDHDK2UBMF4UXLWIANQ3I6CZ4IRFZPSS2257GZL53TD46LNLEQGO) |

## Endpoints

| Resource | URL |
|----------|-----|
| Site | https://evernet.tech |
| API base | https://evernet-storage-api.vercel.app |
| OpenAPI | https://evernet-storage-api.vercel.app/openapi.json |
| Health | https://evernet-storage-api.vercel.app/health |
| S3-shaped surface | https://evernet-storage-api.vercel.app/s3/v1 |
