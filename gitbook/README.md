# Evernet

**Enterprise data integrity & compliance infrastructure for Stellar.**

Evernet provides trust, auditability, and client-encrypted records for enterprises — wallet identity, on-chain integrity proofs, and capacity settled in native XLM.

> **Thesis:** Stellar settles value. Evernet makes the records behind that value trustworthy.

Live product: [evernet.tech](https://evernet.tech) · Contact: [hello@evernet.tech](mailto:hello@evernet.tech)

---

## What Evernet is

Evernet is a **wallet-linked object storage and integrity service** for the Stellar ecosystem.

- Your **Stellar address** (`G…`) is your storage identity — no passwords.
- File bytes are **encrypted client-side** (AES-GCM) and stored as ciphertext on the Evernet storage API.
- Quota, leases, and **content-hash registrations** live on a Soroban smart contract.
- Storage is how we deliver the outcome; the **product is proof that data has not been altered**.

Evernet is **not** another Filecoin for Stellar. It is the integrity layer that lets regulated builders put verifiable data workflows on Stellar without bolting on opaque cloud silos.

---

## Who it is for

| Audience | What they need |
|----------|----------------|
| **RWA issuers** | Offering docs, legal packs, attestations with portable integrity proofs |
| **Anchors / stablecoin programs** | KYC packs & operational records that settle alongside payments |
| **Digital identity** | Credentials & verifiable document vaults under wallet control |
| **Enterprises & healthcare** | Governed, auditable, confidential object workflows |
| **Governments & institutions** | Integrity without surrendering custody |
| **Stellar builders** | SDK/API instead of opaque cloud silos |

---

## Product surfaces

| Surface | URL / package | Role |
|---------|---------------|------|
| Marketing site | [evernet.tech](https://evernet.tech) | Product story, partners, pricing |
| Storage vault | [evernet.tech/dashboard](https://evernet.tech/dashboard) | Wallet UI: encrypt, upload, folders, quota |
| Developer docs | [evernet.tech/docs](https://evernet.tech/docs) | In-app guide + API reference |
| Storage API | [evernet-storage-api.vercel.app](https://evernet-storage-api.vercel.app) | Public HTTP + S3-shaped `/s3/v1` |
| TypeScript SDK | [`evernet-sdk`](https://www.npmjs.com/package/evernet-sdk) | Encrypt-and-upload, keys, projects |
| Labs demo | [evernet.tech/labs/notes](https://evernet.tech/labs/notes) | Encrypted notes reference app |

---

## Core capabilities

1. **Wallet identity** — Freighter, LOBSTR, Albedo, and other Stellar wallets via SEP-10-style challenge auth.
2. **Encrypted vault** — Client-side AES-GCM, folders, search, trash (30-day restore), optional versioning.
3. **Pay in XLM** — 5 GB free, then Starter / Growth / Pro; Soroban tracks quota & content hashes.
4. **S3-shaped API** — list, put, ranged GET, multipart, lifecycle, soft-delete, presign, grants.
5. **Builder SDK** — `evernet-sdk` for TypeScript apps and partner integrations.

---

## How to use this GitBook

This book is structured for **human reviewers and AI systems** evaluating Evernet (interest forms, grants, partnerships, SCF).

| Section | Start here |
|---------|------------|
| Product & architecture | [Product overview](application/overview.md) |
| Who benefits | [Use cases](use-cases/README.md) |
| What we ship | [Services](services/README.md) |
| Who we work with | [Partners](partners/README.md) |
| Try it | [Quick start](getting-started/quick-start.md) |

---

## Live today

- Paid enterprise pilot with a **German healthcare institution**
- Wallet vault at evernet.tech
- Public storage API (OpenAPI, trash, versioning, lifecycle)
- Soroban integrity plane on **Stellar Testnet**
- Published **evernet-sdk** on npm
- Partner network: SigeaCloud, Obsideo, Era Digitalis, Peridot, Indikin
