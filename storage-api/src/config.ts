import { Networks } from '@stellar/stellar-sdk'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

export const config = {
  port: Number(process.env.PORT || 8787),
  network: (process.env.STELLAR_NETWORK || 'testnet') as 'testnet' | 'public',
  horizonUrl:
    process.env.HORIZON_URL ||
    ((process.env.STELLAR_NETWORK || 'testnet') === 'public'
      ? 'https://horizon.stellar.org'
      : 'https://horizon-testnet.stellar.org'),
  rpcUrl:
    process.env.SOROBAN_RPC_URL ||
    ((process.env.STELLAR_NETWORK || 'testnet') === 'public'
      ? 'https://soroban-rpc.mainnet.stellar.gateway.fm'
      : 'https://soroban-testnet.stellar.org'),
  networkPassphrase:
    (process.env.STELLAR_NETWORK || 'testnet') === 'public' ? Networks.PUBLIC : Networks.TESTNET,
  contractId: process.env.STORAGE_CONTRACT_ID || '',
  adminSecret: process.env.STELLAR_ADMIN_SECRET || '',
  treasuryPublic:
    process.env.STELLAR_RECEIVER ||
    'GCUBXGWBBJ4I276JPFQMBJIB5ZR4RJOV47C3YRWZHWITVQXJQKCW72D7',
  jwtSecret: process.env.API_JWT_SECRET || 'evernet-dev-secret-change-me',
  dataDir:
    process.env.DATA_DIR ||
    (process.env.VERCEL ? path.join('/tmp', 'evernet-data') : path.join(root, 'data')),
  blobDir:
    process.env.BLOB_DIR ||
    (process.env.VERCEL ? path.join('/tmp', 'evernet-data', 'blobs') : path.join(root, 'data', 'blobs')),
  baseQuotaBytes: 5 * 1024 * 1024 * 1024,
  planBytes: {
    starter: 10 * 1024 * 1024 * 1024,
    growth: 50 * 1024 * 1024 * 1024,
    pro: 200 * 1024 * 1024 * 1024,
  } as Record<string, number>,
  planPricesXlm: {
    starter: '5',
    growth: '20',
    pro: '60',
  } as Record<string, string>,
  corsOrigin: process.env.CORS_ORIGIN || '*',
}

mkdirSync(config.blobDir, { recursive: true })
mkdirSync(config.dataDir, { recursive: true })
