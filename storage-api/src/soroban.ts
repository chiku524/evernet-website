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
}): Promise<{ returnValue: xdr.ScVal | null; txHash: string } | null> {
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
  return { returnValue: get.returnValue ?? null, txHash: send.hash }
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

/**
 * Soroban tracks quota and lease, but only the off-chain mirror knows how many
 * bytes are actually stored, so usage always comes from the mirror.
 */
export async function getMergedProfile(address: string): Promise<Profile & { source: string }> {
  const mirror = await getProfile(address)
  const onchain = await fetchOnChainProfile(address)
  if (!onchain) return { ...mirror, source: 'mirror' }

  const merged: Profile = {
    address,
    quotaBytes: Math.max(onchain.quotaBytes, mirror.quotaBytes),
    usedBytes: mirror.usedBytes,
    leaseExpires: Math.max(onchain.leaseExpires, mirror.leaseExpires),
    objectCount: mirror.objectCount,
  }
  await setProfile(merged)
  return { ...merged, source: 'soroban' }
}

export async function creditPurchaseOnChain(input: {
  address: string
  planId: string
  paymentHashHex: string
}): Promise<Profile> {
  const local = await creditPurchaseLocal(input.address, input.planId, input.paymentHashHex)

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
    if (ret?.returnValue) {
      const onchain = profileFromNative(scValToNative(ret.returnValue), input.address)
      const merged: Profile = {
        ...local,
        quotaBytes: Math.max(onchain.quotaBytes, local.quotaBytes),
        leaseExpires: Math.max(onchain.leaseExpires, local.leaseExpires),
      }
      await setProfile(merged)
      return merged
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
}): Promise<string | null> {
  if (!hasOnChain()) return null
  try {
    const hashBytes = Buffer.from(input.hashHex, 'hex')
    const ret = await invoke({
      method: 'register_object',
      source: adminKey(),
      args: [
        new Address(input.owner).toScVal(),
        nativeToScVal(hashBytes),
        nativeToScVal(input.size, { type: 'u64' }),
      ],
    })
    return ret?.txHash ?? null
  } catch (err) {
    console.warn('On-chain register_object failed; local mirror already updated', err)
    return null
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
