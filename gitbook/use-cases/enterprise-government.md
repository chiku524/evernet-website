# Enterprise & government

## Problem

Enterprises and institutions need governance, retention, and non-repudiation for regulated data — without surrendering custody of plaintext to a storage vendor or adopting a UX-hostile token network.

## How Evernet helps

| Need | Capability |
|------|------------|
| Confidentiality | Client-side AES-GCM |
| Auditability | Soroban content-hash registry |
| Non-repudiation | Cryptographic proofs of non-modification |
| Capacity in familiar settlement | Native XLM plans (no custom token) |
| Integration | OpenAPI, S3-shaped API, project pools, API keys |

## Typical workflow

1. Organization integrates Evernet via SDK or S3-shaped API.
2. Records are encrypted at the client / edge before upload.
3. Quota and hashes live on Stellar; ciphertext lives on Evernet’s data plane.
4. Auditors verify integrity proofs against registered hashes.

## Outcome

Governed, auditable object workflows for regulated builders — **integrity without surrendering custody**.

Validated commercially first through our [healthcare](healthcare.md) pilot.
