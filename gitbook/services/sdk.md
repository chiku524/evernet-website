# TypeScript SDK

Published package: **`evernet-sdk`** (MIT).

## Purpose

Accelerate partner and dApp integrations so teams do not reinvent auth, encryption, or verification.

## Typical capabilities

- `encryptAndUpload` and related vault helpers
- API key workflows
- Project pools
- Versioning & lifecycle helpers
- S3 helpers (`s3Put`, `s3MultipartPut`, `s3Presign`)

## Quick links

| Resource | Link |
|----------|------|
| npm | [evernet-sdk](https://www.npmjs.com/package/evernet-sdk) |
| Repo folder | [`sdk/`](../../sdk/) |
| SDK README | [`sdk/README.md`](../../sdk/README.md) |
| Reference app | [evernet.tech/labs/notes](https://evernet.tech/labs/notes) |

## Local build / example

```bash
npm run sdk:build
npm run sdk:example -- https://evernet-storage-api.vercel.app
```

## When to use the SDK vs raw API

| Choose | If |
|--------|----|
| **SDK** | TypeScript app; want encrypt-and-upload helpers |
| **OpenAPI / REST** | Non-TS stack or custom client generation |
| **`/s3/v1`** | Existing S3-shaped tooling / multipart / presign patterns |
