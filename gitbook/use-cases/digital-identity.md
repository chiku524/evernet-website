# Digital identity

## Problem

Identity apps need credentials and personal documents under user control, with auditability for issuers and verifiers — without traditional password silos or unencrypted cloud dumps.

## How Evernet helps

| Need | Capability |
|------|------------|
| User-controlled vaults | Wallet identity (`G…`) |
| Confidential credentials | Client-side encryption |
| Verifiable document vaults | On-chain content-hash receipts |
| App builders | `evernet-sdk` + Labs encrypted-notes reference pattern |

## Typical workflow

1. User connects a Stellar wallet.
2. App encrypts credentials / documents client-side.
3. Ciphertext is stored; hashes can be anchored for later verification.
4. User (or authorized verifier workflow) proves integrity without Evernet reading plaintext.

## Outcome

Credentials and personal documents under **wallet control**, with auditability aligned to Stellar’s open, user-owned network philosophy.
