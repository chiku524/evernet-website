/**
 * Upload + deploy storage-market WASM to Soroban Testnet and initialize admin.
 *
 * Usage (from storage-api):
 *   npx tsx src/scripts/deploy-contract.ts
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  Address,
  Keypair,
  nativeToScVal,
  Networks,
  Operation,
  rpc,
  TransactionBuilder,
} from '@stellar/stellar-sdk'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const WASM_CANDIDATES = [
  path.join(ROOT, 'contracts/storage-market/target/wasm32v1-none/release/storage_market.wasm'),
  path.join(ROOT, 'contracts/target/wasm32v1-none/release/storage_market.wasm'),
  path.join(ROOT, 'contracts/storage-market/target/wasm32-unknown-unknown/release/storage_market.wasm'),
]

const RPC = process.env.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org'
const HORIZON = process.env.HORIZON_URL || 'https://horizon-testnet.stellar.org'
const SECRET = process.env.STELLAR_ADMIN_SECRET || ''
const NETWORK = Networks.TESTNET

async function fund(publicKey: string) {
  const res = await fetch(`https://friendbot.stellar.org?addr=${encodeURIComponent(publicKey)}`)
  if (!res.ok) {
    const text = await res.text()
    if (!text.includes('already funded') && !text.includes('create_account')) {
      console.warn('Friendbot:', text.slice(0, 200))
    }
  }
}

async function main() {
  if (!SECRET) throw new Error('STELLAR_ADMIN_SECRET required')
  const kp = Keypair.fromSecret(SECRET)
  console.log('Admin', kp.publicKey())

  const wasmPath = WASM_CANDIDATES.find((p) => existsSync(p))
  if (!wasmPath) throw new Error(`WASM not found. Tried:\n${WASM_CANDIDATES.join('\n')}`)
  const wasm = readFileSync(wasmPath)
  console.log('WASM', wasmPath, wasm.length, 'bytes')

  await fund(kp.publicKey())
  // wait for account
  await new Promise((r) => setTimeout(r, 3000))

  const server = new rpc.Server(RPC, { allowHttp: false })
  let account = await server.getAccount(kp.publicKey())

  // Upload WASM
  const uploadTx = new TransactionBuilder(account, {
    fee: '10000000',
    networkPassphrase: NETWORK,
  })
    .addOperation(
      Operation.uploadContractWasm({
        wasm,
      }),
    )
    .setTimeout(180)
    .build()

  let sim = await server.simulateTransaction(uploadTx)
  if (rpc.Api.isSimulationError(sim)) throw new Error(`upload sim: ${sim.error}`)
  let prepared = rpc.assembleTransaction(uploadTx, sim).build()
  prepared.sign(kp)
  let send = await server.sendTransaction(prepared)
  console.log('Upload send', send.hash, send.status)

  let get = await server.getTransaction(send.hash)
  const t0 = Date.now()
  while (get.status === rpc.Api.GetTransactionStatus.NOT_FOUND && Date.now() - t0 < 90_000) {
    await new Promise((r) => setTimeout(r, 2000))
    get = await server.getTransaction(send.hash)
  }
  if (get.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
    throw new Error(`Upload failed: ${get.status}`)
  }
  const wasmHash = get.returnValue
  if (!wasmHash) throw new Error('No wasm hash returned')
  console.log('Wasm hash ok')

  // Create contract
  account = await server.getAccount(kp.publicKey())
  const createTx = new TransactionBuilder(account, {
    fee: '10000000',
    networkPassphrase: NETWORK,
  })
    .addOperation(
      Operation.createCustomContract({
        address: Address.fromString(kp.publicKey()),
        wasmHash: wasmHash.bytes ? wasmHash.bytes() : (wasmHash as unknown as Buffer),
        salt: Buffer.alloc(32),
      } as never),
    )
    .setTimeout(180)
    .build()

  // Prefer Contract.create / Operation.createCustomContract via SDK helpers
  // Fallback: use stellar contract deploy style with Operation.invokeHostFunction
  sim = await server.simulateTransaction(createTx)
  if (rpc.Api.isSimulationError(sim)) {
    console.warn('createCustomContract sim failed, trying alternative deploy…', sim.error)
    // Alternative using `@stellar/stellar-sdk` Contract
    const { Contract } = await import('@stellar/stellar-sdk')
    // Use deploy via upload hash from get.returnValue as BytesN
    const deployOp = Operation.createCustomContract({
      address: Address.fromString(kp.publicKey()),
      wasmHash: get.returnValue!,
      salt: Buffer.alloc(32),
    } as never)
    void Contract
    void deployOp
    throw new Error(`Create contract simulation failed: ${sim.error}`)
  }

  prepared = rpc.assembleTransaction(createTx, sim).build()
  prepared.sign(kp)
  send = await server.sendTransaction(prepared)
  console.log('Create send', send.hash)

  get = await server.getTransaction(send.hash)
  const t1 = Date.now()
  while (get.status === rpc.Api.GetTransactionStatus.NOT_FOUND && Date.now() - t1 < 90_000) {
    await new Promise((r) => setTimeout(r, 2000))
    get = await server.getTransaction(send.hash)
  }
  if (get.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
    throw new Error(`Create failed: ${get.status}`)
  }

  // Extract contract id from result
  const contractId = Address.fromScVal(get.returnValue!).toString()
  console.log('CONTRACT_ID', contractId)

  // Initialize
  account = await server.getAccount(kp.publicKey())
  const { Contract } = await import('@stellar/stellar-sdk')
  const contract = new Contract(contractId)
  const initTx = new TransactionBuilder(account, {
    fee: '10000000',
    networkPassphrase: NETWORK,
  })
    .addOperation(contract.call('initialize', new Address(kp.publicKey()).toScVal()))
    .setTimeout(180)
    .build()

  sim = await server.simulateTransaction(initTx)
  if (rpc.Api.isSimulationError(sim)) throw new Error(`init sim: ${sim.error}`)
  prepared = rpc.assembleTransaction(initTx, sim).build()
  prepared.sign(kp)
  send = await server.sendTransaction(prepared)
  console.log('Init send', send.hash)

  get = await server.getTransaction(send.hash)
  const t2 = Date.now()
  while (get.status === rpc.Api.GetTransactionStatus.NOT_FOUND && Date.now() - t2 < 90_000) {
    await new Promise((r) => setTimeout(r, 2000))
    get = await server.getTransaction(send.hash)
  }
  if (get.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
    throw new Error(`Init failed: ${get.status}`)
  }
  console.log('Initialized')

  // Write env fragment
  const envPath = path.join(ROOT, 'storage-api', '.env')
  let env = existsSync(envPath) ? readFileSync(envPath, 'utf8') : ''
  if (env.includes('STORAGE_CONTRACT_ID=')) {
    env = env.replace(/STORAGE_CONTRACT_ID=.*/g, `STORAGE_CONTRACT_ID=${contractId}`)
  } else {
    env += `\nSTORAGE_CONTRACT_ID=${contractId}\n`
  }
  writeFileSync(envPath, env)
  writeFileSync(path.join(ROOT, 'contracts', 'deployed-testnet.json'), JSON.stringify({
    network: 'testnet',
    contractId,
    admin: kp.publicKey(),
    wasmPath,
    horizon: HORIZON,
    rpc: RPC,
    deployedAt: new Date().toISOString(),
  }, null, 2))
  console.log('Wrote storage-api/.env and contracts/deployed-testnet.json')
  void nativeToScVal
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
