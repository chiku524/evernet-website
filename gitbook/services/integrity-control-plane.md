# Integrity control plane

The Soroban smart contract **`storage-market`** is Evernet’s on-chain control plane.

## What lives on Stellar

| On-chain | Off-chain |
|----------|-----------|
| Quota & used bytes | Encrypted object bytes (ciphertext) |
| Lease / plan state | Blob storage (Vercel Blob / disk) |
| Object / content-hash registrations | Folder metadata as managed by API |
| Payment dedupe for capacity purchases | API keys, JWT sessions |

## Why this design

- **Efficient** — enterprise-scale objects never bloat the ledger.
- **Auditable** — content hashes turn Stellar into an integrity receipt layer.
- **Aligned** — capacity settles in native XLM; identity is the Stellar address.

## Network status

| Item | Status |
|------|--------|
| Testnet contract | Live |
| Contract ID | `CBWJEDHDK2UBMF4UXLWIANQ3I6CZ4IRFZPSS2257GZL53TD46LNLEQGO` |
| Mainnet | Roadmap (hardening, audits, production control plane) |

## Lab

[View contract on Stellar Lab (Testnet)](https://lab.stellar.org/r/testnet/contract/CBWJEDHDK2UBMF4UXLWIANQ3I6CZ4IRFZPSS2257GZL53TD46LNLEQGO)

See also: [Architecture](../application/architecture.md) · [How it works](../application/how-it-works.md)
