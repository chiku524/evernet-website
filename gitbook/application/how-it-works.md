# How it works

Four steps from wallet to on-chain integrity receipt.

## 1. Connect your wallet

User opens the vault (or an integrating app) and connects with Freighter, LOBSTR, Albedo, or another supported Stellar wallet.

- SEP-10-style challenge signing issues a short-lived session.
- No passwords. No funds move during auth.

## 2. Encrypt in the browser (or app)

Objects are encrypted **client-side** with AES-GCM using a vault passphrase (or app-managed key material).

- Evernet’s servers receive **ciphertext only**.
- Optional convenience modes exist in the vault UX; production integrity workflows should keep passphrase/key custody with the user or regulated customer.

## 3. Upload ciphertext

Ciphertext is uploaded to the Evernet Storage API:

- Vault UI (drag-and-drop, folders)
- REST / OpenAPI
- S3-shaped `/s3/v1` (put, multipart ≤ 1 GB, ranged GET, etc.)
- `evernet-sdk` helpers (`encryptAndUpload`, `s3Put`, …)

## 4. Stellar records the receipt

The Soroban `storage-market` contract tracks:

- Quota and used bytes
- Lease / plan state
- Object / content-hash registrations
- Payment dedupe for XLM capacity purchases

Stellar becomes the **integrity receipt layer**. Counterparties can later verify that registered hashes still match the documents.

---

## Capacity purchase flow

1. Wallet pays treasury in XLM for Starter / Growth / Pro.
2. API verifies the payment on Horizon.
3. Admin path invokes `credit_purchase` on Soroban.
4. Dashboard quota updates for that wallet on any browser.

## Store → Anchor → Verify (enterprise PoC)

| Step | Action |
|------|--------|
| **Store** | Client-encrypt and upload offering docs / KYC packs / operational records |
| **Anchor** | Register cryptographic content hashes on Soroban |
| **Verify** | Prove documents unmodified to auditors, investors, or regulators without exposing plaintext |

This loop is the flagship Stellar use-case demonstration for Anchors and RWA issuers.
