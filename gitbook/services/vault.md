# Encrypted vault

The vault is the primary end-user application at [evernet.tech/dashboard](https://evernet.tech/dashboard).

## Features

| Feature | Detail |
|---------|--------|
| Wallet connect | Freighter, LOBSTR, Albedo, and other kit-supported wallets |
| Session auth | SEP-10-style challenge → short-lived JWT |
| Encryption | Client-side AES-GCM with vault passphrase |
| Organization | Folders, search |
| Trash | Soft-delete with 30-day restore |
| Versioning | Optional object versioning |
| Quota meter | Free 5 GB + purchased capacity |
| API keys | Create keys for server integrations from the vault |

## User journey

1. Open the vault and connect a Stellar wallet (Testnet today for the integrity plane).
2. Sign the auth challenge (no funds move).
3. Unlock with passphrase (or use configured convenience mode).
4. Drag-and-drop files — encrypted in-browser, uploaded as ciphertext.
5. Buy additional capacity in XLM when needed.

## Relationship to other services

The vault uses the same Storage API surface available to developers. Anything done in the UI can be automated via OpenAPI, `/s3/v1`, or `evernet-sdk`.
