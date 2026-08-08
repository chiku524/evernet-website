# Security

## Core guarantees

| Guarantee | Mechanism |
|-----------|-----------|
| Confidentiality | Client-side AES-GCM — servers store ciphertext |
| Identity | Stellar wallet address + SEP-10-style challenge |
| Integrity receipts | Content hashes on Soroban |
| Session hygiene | Short-lived JWT (~24h) |
| Server integrations | Scoped API keys (`evn_live_…`) |

## What Evernet does **not** do

- Store plaintext of vault objects (encryption happens client-side).
- Require a custom storage token.
- Put file bytes on the Stellar ledger.

## Auth safety

Challenge transactions are sequence-0 with timebounds and are **not submitable** as value transfers. Signing for login does not move XLM.

## CORS

Browser CORS for the Storage API is limited to Evernet origins, localhost, and Vercel previews. Third-party apps should call the API from their backends using API keys.

## Passphrase custody

The vault passphrase protects encryption keys. Losing the passphrase can mean losing access to ciphertext. Production and regulated workflows should treat passphrase / key custody as a first-class operational concern.

## Roadmap hardening

Mainnet control plane, security audits, and compliance-friendly audit logs / GDPR–MiCA-oriented options are planned. See [Roadmap](../roadmap.md).
