import {
  Address,
  Contract,
  Keypair,
  nativeToScVal,
  rpc,
  scValToNative,
  TransactionBuilder,
  xdr,
} from '@stellar/stellar-sdk'
import { config } from './config.js'
import type { Profile } from './store.js'
import { creditPurchaseLocal, getProfile, setProfile } from './store.js'

function server() {
  return new rpc.Server(config.rpcUrl, { allowHttp: false })
}

function hasOnChain(): boolean {
  return Boolean(config.contractId && config.adminSecret)
}

function adminKey(): Keypair {
  return Keypair.fromSecret(config.adminSecret)
}

function profileFromNative(native: unknown, address: string): Profile {
  const n = (native ?? {}) as Record<string, unknown>
  return {
    address,
    quotaBytes: Number(n.quota_bytes ?? 0),
    usedBytes: Number(n.used_bytes ?? 0),
    leaseExpires: Number(n.lease_expires ?? 0),
    objectCount: Number(n.object_count ?? 0),
  }
}

async function invoke({
  method,
  args,
  source,
}: {
  method: string
  args: xdr.ScVal[]
  source: Keypair
}): Promise<xdr.ScVal | null> {
  if (!hasOnChain()) return null
  const s = server()
  const account = await s.getAccount(source.publicKey())
  const contract = new Contract(config.contractId)
  const tx = new TransactionBuilder(account, {
    fee: '100000',
    networkPassphrase: config.networkPassphrase,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(120)
    .build()

  const sim = await s.simulateTransaction(tx)
  if (rpc.Api.isSimulationError(sim)) {
    throw new Error(`Soroban simulate error: ${sim.error}`)
  }
  const prepared = rpc.assembleTransaction(tx, sim).build()
  prepared.sign(source)
  const send = await s.sendTransaction(prepared)
  if (send.status === 'ERROR') {
    throw new Error(`Soroban send error: ${JSON.stringify(send)}`)
  }

  let get = await s.getTransaction(send.hash)
  const start = Date.now()
  while (get.status === rpc.Api.GetTransactionStatus.NOT_FOUND && Date.now() - start < 60_000) {
    await new Promise((r) => setTimeout(r, 1500))
    get = await s.getTransaction(send.hash)
  }
  if (get.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
    throw new Error(`Soroban tx failed: ${get.status}`)
  }
  return get.returnValue ?? null
}

export async function fetchOnChainProfile(address: string): Promise<Profile | null> {
  if (!hasOnChain()) return null
  try {
    const s = server()
    const contract = new Contract(config.contractId)
    const sourcePk = adminKey().publicKey()
    const account = await s.getAccount(sourcePk)
    const tx = new TransactionBuilder(account, {
      fee: '100000',
      networkPassphrase: config.networkPassphrase,
    })
      .addOperation(contract.call('get_profile', new Address(address).toScVal()))
      .setTimeout(60)
      .build()
    const sim = await s.simulateTransaction(tx)
    if (!rpc.Api.isSimulationSuccess(sim) || !sim.result) return null
    return profileFromNative(scValToNative(sim.result.retval), address)
  } catch (err) {
    console.warn('fetchOnChainProfile failed, using local mirror', err)
    return null
  }
}

export async function getMergedProfile(address: string): Promise<Profile & { source: string }> {
  const onchain = await fetchOnChainProfile(address)
  if (onchain) {
    setProfile(onchain)
    return { ...onchain, source: 'soroban' }
  }
  return { ...getProfile(address), source: 'mirror' }
}

export async function creditPurchaseOnChain(input: {
  address: string
  planId: string
  paymentHashHex: string
}): Promise<Profile> {
  const local = creditPurchaseLocal(input.address, input.planId, input.paymentHashHex)

  if (!hasOnChain()) return local

  try {
    const hashBytes = Buffer.from(input.paymentHashHex, 'hex')
    if (hashBytes.length !== 32) throw new Error('payment hash must be 32 bytes')
    const ret = await invoke({
      method: 'credit_purchase',
      source: adminKey(),
      args: [
        new Address(input.address).toScVal(),
        nativeToScVal(input.planId, { type: 'symbol' }),
        nativeToScVal(hashBytes),
        nativeToScVal(30, { type: 'u32' }),
      ],
    })
    if (ret) {
      const profile = profileFromNative(scValToNative(ret), input.address)
      setProfile(profile)
      return profile
    }
  } catch (err) {
    console.warn('On-chain credit failed; local mirror credited', err)
  }
  return local
}

export async function registerObjectOnChain(input: {
  owner: string
  hashHex: string
  size: number
}): Promise<void> {
  if (!hasOnChain()) return
  try {
    const hashBytes = Buffer.from(input.hashHex, 'hex')
    await invoke({
      method: 'register_object',
      source: adminKey(),
      args: [
        new Address(input.owner).toScVal(),
        nativeToScVal(hashBytes),
        nativeToScVal(input.size, { type: 'u64' }),
      ],
    })
  } catch (err) {
    console.warn('On-chain register_object failed; local mirror already updated', err)
  }
}

export async function deleteObjectOnChain(input: { owner: string; hashHex: string }): Promise<void> {
  if (!hasOnChain()) return
  try {
    const hashBytes = Buffer.from(input.hashHex, 'hex')
    await invoke({
      method: 'delete_object',
      source: adminKey(),
      args: [
        new Address(input.owner).toScVal(),
        nativeToScVal(hashBytes),
      ],
    })
  } catch (err) {
    console.warn('On-chain delete_object failed; local mirror already updated', err)
  }
}

export function onChainEnabled() {
  return hasOnChain()
}
