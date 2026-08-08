# Storage API

Public HTTP API for wallet-linked encrypted object storage — the same surface as the vault.

## Endpoints

| Resource | URL |
|----------|-----|
| Base | https://evernet-storage-api.vercel.app |
| OpenAPI | [/openapi.json](https://evernet-storage-api.vercel.app/openapi.json) |
| Health | [/health](https://evernet-storage-api.vercel.app/health) |
| Human docs | [evernet.tech/docs#api](https://evernet.tech/docs#api) |
| S3-shaped | `/s3/v1` |

## Authentication

| Method | Use |
|--------|-----|
| SEP-10-style challenge → JWT Bearer | Interactive wallet sessions (~24h) |
| API keys `evn_live_…` | Server-side / partner integrations |

Prefer server-side calls from third-party apps. Browser CORS is limited to Evernet origins, localhost, and Vercel previews.

## S3-shaped surface (`/s3/v1`)

- List by key / prefix
- Put object
- Ranged GET / HEAD / copy
- Multipart upload (≤ 1 GB)
- Presigned downloads
- Revocable share grants
- Lifecycle rules
- Soft-delete

## Other API capabilities

- Folders & projects (soft-cap pools)
- Batch delete
- Versioning (opt-in)
- Horizon-verified XLM purchases → Soroban `credit_purchase`

## Limits (current)

| Operation | Limit |
|-----------|-------|
| Simple put | ~80 MB |
| Multipart | ≤ 1 GB |
