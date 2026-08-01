# @evernet/sdk

TypeScript client for the [Evernet Storage API](https://evernet.tech/docs#api) — wallet-linked, client-encrypted object storage on Stellar.

## Install

```bash
npm install @evernet/sdk
# optional peer for challenge signing in Node:
npm install @stellar/stellar-sdk
```

## Encrypt → upload → hash

```ts
import { EvernetClient, walletPassphrase } from '@evernet/sdk'

const client = new EvernetClient({
  baseUrl: 'https://evernet-storage-api.vercel.app',
})

// 1) Wallet auth (sign challenge in browser / with Keypair — do not submit)
await client.loginWithSigner(address, async (xdr, network) => signWithWallet(xdr, network))

// 2) Encrypt locally, upload ciphertext, get content hash
const { object } = await client.encryptAndUpload({
  data: new TextEncoder().encode('secret notes'),
  name: 'notes.txt',
  mimeType: 'text/plain',
  folder: 'docs',
  passphrase: walletPassphrase(address), // prefer a strong user secret in production
})

console.log(object.hash, object.registrationTx)
```

## API keys (servers)

Create keys with a wallet JWT (vault UI or `createApiKey`), then:

```ts
const server = new EvernetClient({
  baseUrl: 'https://evernet-storage-api.vercel.app',
  token: process.env.EVERNET_API_KEY!, // evn_live_…
})
await server.list()
```

## Example

```bash
cd sdk && npm install && npm run build
npm run example:encrypt-upload
```

Docs: https://evernet.tech/docs#sdk · OpenAPI: https://evernet-storage-api.vercel.app/openapi.json
