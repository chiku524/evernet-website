# RWA & capital markets

## Problem

RWA issuers need confidential offering materials, legal packs, and attestations — with portable integrity proofs tied to on-chain assets. Opaque cloud silos break the trust story that tokenized assets depend on.

## How Evernet helps

| Need | Capability |
|------|------------|
| Confidential materials | Client-side AES-GCM encryption before upload |
| Portable integrity | Content hashes registered on Soroban |
| Wallet-native custody model | Stellar address as identity |
| Builder integration | SDK + S3-shaped API for issuer platforms |

## Typical workflow

1. **Store** offering docs / legal packs / attestations via vault or SDK.
2. **Anchor** content hashes on the Soroban integrity control plane.
3. **Verify** unmodified status for investors, auditors, or counterparties without revealing plaintext.

## Outcome

Issuers keep documents private while giving markets a cryptographic way to trust that referenced records have not changed — complementary to Stellar settlement, not a competing storage network.
