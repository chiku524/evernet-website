# Why Evernet

## The real gap is trust — not disk space

Enterprises, Anchors, RWA issuers, and stablecoin programs need more than payments. They need confidential documents, credentials, and operational records that stay intact, auditable, and compliant.

### Problems we solve

1. **Integrity without proof**  
   Traditional SaaS buckets offer storage but no portable, cryptographically verifiable proof that a document has not been modified.

2. **Compliance vs. custody**  
   Regulated industries need governance, audit trails, and client-side confidentiality — not another account/password silo or a UX-hostile storage-token network.

3. **Stellar apps without records**  
   RWA, Anchors, identity, and enterprise apps settle on Stellar but still outsource the documents those assets and identities refer to — breaking the trust story.

4. **Enterprise demand**  
   Healthcare, finance, and government already generate large volumes of records that must remain trustworthy. Capacity alone does not close those deals; integrity does.

---

## What we unlock on Stellar

| Capability | Outcome |
|------------|---------|
| Trust & non-repudiation | Parties can prove records were not altered |
| Auditability | Content hashes registered on Soroban |
| Confidentiality | Client-side AES-GCM — Evernet never sees plaintext |
| Wallet identity | `G…` address is the account |
| Native settlement | Capacity paid in XLM — no custom token |

---

## Positioning

> Reviewers should not ask “why does Stellar need another Filecoin?”  
> They should ask which enterprise use cases become possible when documents can be stored privately and their cryptographic proofs anchored on Stellar.

**Data integrity infrastructure. Encrypted storage is the delivery mechanism.**

Stellar is the **integrity control plane** (auth, quota, content hashes). Encrypted object bytes stay off-chain — practical for enterprise scale.

---

## Flagship proof loop

**Store → Anchor → Verify**

1. **Store** — Client-encrypt and upload documents via vault or SDK.
2. **Anchor** — Register content hashes on Soroban so Stellar becomes the integrity receipt layer.
3. **Verify** — Counterparties, regulators, or investors confirm documents are unmodified without exposing plaintext.

This is the Anchor / RWA PoC path and the core reason Evernet belongs in the Stellar stack.
