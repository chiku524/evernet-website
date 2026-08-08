# Product overview

Evernet is a full-stack integrity product: a wallet vault for end users, a public API and SDK for builders, and a Soroban control plane for quota and content-hash proofs.

## Application components

| Component | Description |
|-----------|-------------|
| **Marketing site** | Product narrative, partners, GTM, pricing (`/`) |
| **Vault dashboard** | Browser vault: connect wallet, unlock passphrase, upload ciphertext, manage folders & quota (`/dashboard`) |
| **In-app docs** | User guide + developer API docs (`/docs`) |
| **Pitch brief** | Confidential SCF / investor narrative (`/pitch`) |
| **Labs** | Encrypted notes reference dApp (`/labs/notes`) |
| **Storage API** | Express service: SEP-10 / API-key auth, blob store, S3-shaped surface |
| **Soroban contract** | `storage-market` — quota, used bytes, lease, object registrations |
| **evernet-sdk** | TypeScript npm client for apps and partners |

## Tech stack

| Layer | Stack |
|-------|--------|
| Frontend | Vite, React 19, TypeScript, React Router, Framer Motion |
| Wallets | Stellar Wallets Kit, Stellar SDK |
| Backend | Express 5 (`storage-api`), Vercel Blob or local disk |
| On-chain | Soroban Rust contract `storage-market` (Testnet) |
| SDK | `evernet-sdk` (TypeScript, MIT) |
| Deploy | Vercel (site + API) |

## Design principles

1. **Wallet-native identity** — The Stellar address is the account. No email/password silo.
2. **Client-side encryption** — Plaintext never leaves the user’s browser (or the integrating app’s encryption boundary).
3. **Control plane on Stellar** — Quota, leases, and content hashes on Soroban; bytes off-chain.
4. **Native XLM capacity** — No custom storage token; plans settle in XLM.
5. **Builder-first surfaces** — OpenAPI, S3-shaped HTTP, and an npm SDK so partners integrate without standing up their own stack.

## What “live” means today

- Paid German healthcare pilot (commercial validation)
- Public vault at [evernet.tech](https://evernet.tech)
- Public API with OpenAPI, soft-delete, versioning, lifecycle
- Testnet Soroban integrity plane
- Published `evernet-sdk`

See also: [Architecture](architecture.md) · [How it works](how-it-works.md) · [Services](../services/README.md)
