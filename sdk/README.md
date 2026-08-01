# evernet-sdk

TypeScript client for the [Evernet Storage API](https://evernet.tech/docs#api) — wallet-linked, client-encrypted object storage on Stellar.

**npm:** [evernet-sdk](https://www.npmjs.com/package/evernet-sdk) · **Docs:** [evernet.tech/docs#sdk](https://evernet.tech/docs#sdk) · **Demo:** [evernet.tech/labs/notes](https://evernet.tech/labs/notes)

## Install

```bash
npm install evernet-sdk
# optional peer for challenge signing in Node:
npm install @stellar/stellar-sdk
```

## Encrypt → upload → hash

```ts
import { EvernetClient, walletPassphrase } from 'evernet-sdk'

const client = new EvernetClient({
  baseUrl: 'https://evernet-storage-api.vercel.app',
})

// 1) Wallet auth (sign challenge in browser / with Keypair — do not submit)
await client.loginWithSigner(address, async (xdr, network) => signWithWallet(xdr, network))

// 2) Encrypt locally, upload ciphertext, get content hash (+ optional Soroban registrationTx)
const passphrase = 'your-strong-secret' // prefer this over walletPassphrase(address)
const { object } = await client.encryptAndUpload({
  data: new TextEncoder().encode('secret notes'),
  name: 'notes.txt',
  mimeType: 'text/plain',
  folder: 'docs',
  passphrase,
})

console.log(object.hash, object.registrationTx)
const plain = await client.downloadAndDecrypt(object.hash, passphrase)
```

`walletPassphrase(address)` is a demo convenience helper that matches the vault’s “convenience mode.” Prefer a strong user-chosen secret in production.

## S3-shaped cloud API

```ts
await client.s3Put('docs/report.bin', ciphertext, { encrypted: true })
const listed = await client.s3List({ prefix: 'docs/', delimiter: '/' })
await client.s3Head('docs/report.bin')
await client.s3Copy('docs/report.bin', 'docs/report-copy.bin')
const { url } = await client.s3Presign({ key: 'docs/report.bin', expiresInSec: 3600 })
const grant = await client.s3CreateGrant({ key: 'docs/report.bin', expiresInSec: 7 * 86400 })
// grant.url → revocable shared download (ciphertext)
// large payloads:
await client.s3MultipartPut('media/video.bin', bigCiphertext, { encrypted: true })
```

## API keys & project pools

Create keys (and optional project soft caps) with a wallet JWT in the [vault](https://evernet.tech/dashboard) or via the SDK, then:

```ts
const server = new EvernetClient({
  baseUrl: 'https://evernet-storage-api.vercel.app',
  token: process.env.EVERNET_API_KEY!, // evn_live_…
})

await server.getUsage() // profile + auth + project metering when key is project-bound
await server.list()
```

```ts
// wallet JWT session required for management:
const project = await client.createProject({ name: 'mobile-app', maxBytes: 2 * 1024 ** 3 })
const key = await client.createApiKey('mobile-prod', project.id)
```

## Example

```bash
cd sdk && npm install && npm run build
npm run example:encrypt-upload
```

OpenAPI: https://evernet-storage-api.vercel.app/openapi.json
