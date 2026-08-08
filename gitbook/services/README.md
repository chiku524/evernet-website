# Services

Evernet ships a complete integrity stack: end-user vault, developer API, TypeScript SDK, and a Soroban control plane.

## Service map

| Service | Audience | Summary |
|---------|----------|---------|
| [Encrypted vault](vault.md) | End users & operators | Wallet UI for encrypt, upload, folders, quota |
| [Storage API](storage-api.md) | Backend / partners | REST + OpenAPI + S3-shaped `/s3/v1` |
| [TypeScript SDK](sdk.md) | App builders | `evernet-sdk` encrypt-and-upload helpers |
| [Integrity control plane](integrity-control-plane.md) | All | Soroban quota, leases, content hashes |
| [Pricing & capacity](pricing.md) | All | Free tier + XLM plans |

## Capability summary

- Wallet identity (SEP-10-style challenge → JWT)
- Client-side AES-GCM encryption
- Folders, search, trash (30-day restore)
- Optional object versioning & lifecycle rules
- Multipart uploads (≤ 1 GB); put max ~80 MB
- Presigned downloads & revocable share grants
- API keys (`evn_live_…`) and project soft-cap pools
- Capacity settled in native XLM

## Commercial / upcoming offerings

- Enterprise SLA / compliance tiers
- GDPR / MiCA-oriented options
- Integrity verification workflows for RWA / Anchors / identity
- Mainnet integrity control plane

See product live at [evernet.tech](https://evernet.tech) and API docs at [evernet.tech/docs](https://evernet.tech/docs).
