# Anchors & stablecoins

## Problem

Anchor and stablecoin programs settle payments on Stellar but still outsource KYC packs and operational records. Compliance and ops data sit outside the trust boundary of the payment rail.

## How Evernet helps

| Need | Capability |
|------|------------|
| KYC & operational packs | Encrypted object vault + folders |
| Records that settle with payments | Integrity proofs on the same network as settlement |
| Server integrations | API keys (`evn_live_…`) for backend pipelines |
| Soft-delete / retention patterns | Trash (30-day restore), lifecycle rules, optional versioning |

## Typical workflow

1. Anchor systems encrypt and upload KYC / ops documents via API or SDK.
2. Content hashes are registered on Soroban.
3. Audits and partner reviews verify integrity without opening plaintext to Evernet or unnecessary third parties.

## Outcome

Operational and compliance records that **settle alongside payments** — verifiable without exposing sensitive customer data on-chain.
