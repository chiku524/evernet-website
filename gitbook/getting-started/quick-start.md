# Quick start

## Try the vault (5 minutes)

1. Open [evernet.tech/dashboard](https://evernet.tech/dashboard).
2. Connect a supported Stellar wallet (Testnet for the integrity plane).
3. Sign the auth challenge — no funds move.
4. Set / enter your vault passphrase.
5. Upload a file — it is encrypted in the browser and stored as ciphertext.
6. Optionally buy capacity in XLM (Starter / Growth / Pro).

## For developers

| Path | Link |
|------|------|
| In-app docs | [evernet.tech/docs](https://evernet.tech/docs) |
| OpenAPI | [openapi.json](https://evernet-storage-api.vercel.app/openapi.json) |
| SDK | `npm i evernet-sdk` |
| Reference app | [evernet.tech/labs/notes](https://evernet.tech/labs/notes) |

### Local development (repo)

```bash
# Terminal 1 — storage API
npm run api

# Terminal 2 — web app
cp .env.example .env
npm install
npm run dev
```

Open `http://localhost:5173/dashboard`.

### API smoke test

```bash
cd storage-api && npx tsx src/scripts/smoke-auth.ts https://evernet-storage-api.vercel.app
```

## Next reads

- [Supported wallets](wallets.md)
- [Storage API](../services/storage-api.md)
- [TypeScript SDK](../services/sdk.md)
- [Security](../security/overview.md)
