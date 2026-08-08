# Supported wallets

The connect dialog is driven by the [Stellar Wallets Kit](https://stellarwalletskit.dev/).

## Desktop / extension wallets

Freighter, LOBSTR, xBull, Albedo, Rabet, Hana, Klever, OneKey, Bitget Wallet, Fordefi, Cactus Link, D'CENT.

Optional: WalletConnect QR pairing when `VITE_WALLETCONNECT_PROJECT_ID` is configured.

## Mobile guidance

Mobile browsers cannot load browser extensions, so extension-only wallets are invisible on a phone. Users should:

1. Open **evernet.tech** inside their wallet’s in-app browser, **or**
2. Pick a wallet that authorises over a link (LOBSTR, xBull PWA, Albedo), **or**
3. Use WalletConnect when enabled.

## Auth design note

Auth uses a SEP-10-style challenge rather than `signMessage`, because only a subset of wallets implement arbitrary message signing. The API returns a sequence-0 transaction with a random nonce and 5-minute timebounds; the wallet counter-signs and the API verifies both signatures. The transaction is never submitted, so signing moves **no funds**.
