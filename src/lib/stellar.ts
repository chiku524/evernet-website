import {
  Asset,
  Horizon,
  Memo,
  Networks,
  Operation,
  TransactionBuilder,
} from '@stellar/stellar-sdk'
import freighterApi from '@stellar/freighter-api'

export type StellarNetworkId = 'testnet' | 'public'

export type StoragePlan = {
  id: string
  name: string
  description: string
  bytes: number
  priceXlm: string
  popular?: boolean
}

const GB = 1024 * 1024 * 1024

/** Evernet storage treasury — replace via VITE_STELLAR_RECEIVER */
export const DEFAULT_RECEIVER =
  import.meta.env.VITE_STELLAR_RECEIVER?.trim() ||
  'GCUBXGWBBJ4I276JPFQMBJIB5ZR4RJOV47C3YRWZHWITVQXJQKCW72D7'

export const STORAGE_PLANS: StoragePlan[] = [
  {
    id: 'starter',
    name: 'Starter',
    description: 'Extra room for docs and credentials',
    bytes: 10 * GB,
    priceXlm: '5',
  },
  {
    id: 'growth',
    name: 'Growth',
    description: 'Media, archives, and team vaults',
    bytes: 50 * GB,
    priceXlm: '20',
    popular: true,
  },
  {
    id: 'pro',
    name: 'Pro',
    description: 'High-volume dApp and enterprise data',
    bytes: 200 * GB,
    priceXlm: '60',
  },
]

const NETWORK_KEY = 'evernet-stellar-network'
const ADDRESS_KEY = 'evernet-stellar-address'

export function getNetworkConfig(network: StellarNetworkId) {
  if (network === 'public') {
    return {
      id: 'public' as const,
      label: 'Mainnet',
      passphrase: Networks.PUBLIC,
      horizonUrl: 'https://horizon.stellar.org',
      explorerTx: (hash: string) => `https://stellar.expert/explorer/public/tx/${hash}`,
      friendbotUrl: null as string | null,
    }
  }
  return {
    id: 'testnet' as const,
    label: 'Testnet',
    passphrase: Networks.TESTNET,
    horizonUrl: 'https://horizon-testnet.stellar.org',
    explorerTx: (hash: string) => `https://stellar.expert/explorer/testnet/tx/${hash}`,
    friendbotUrl: 'https://friendbot.stellar.org',
  }
}

export function loadPreferredNetwork(): StellarNetworkId {
  const fromEnv = import.meta.env.VITE_STELLAR_NETWORK?.trim().toLowerCase()
  if (fromEnv === 'public' || fromEnv === 'mainnet') return 'public'
  if (fromEnv === 'testnet') return 'testnet'
  const saved = localStorage.getItem(NETWORK_KEY)
  if (saved === 'public' || saved === 'testnet') return saved
  return 'testnet'
}

export function savePreferredNetwork(network: StellarNetworkId) {
  localStorage.setItem(NETWORK_KEY, network)
}

export function loadSavedAddress(): string | null {
  return localStorage.getItem(ADDRESS_KEY)
}

export function saveAddress(address: string | null) {
  if (address) localStorage.setItem(ADDRESS_KEY, address)
  else localStorage.removeItem(ADDRESS_KEY)
}

export function shortenAddress(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`
}

export async function isFreighterInstalled(): Promise<boolean> {
  try {
    const result = await freighterApi.isConnected()
    return Boolean(result.isConnected)
  } catch {
    return false
  }
}

export async function connectFreighter(): Promise<string> {
  const access = await freighterApi.requestAccess()
  if (access.error) throw new Error(access.error)
  const { address, error } = await freighterApi.getAddress()
  if (error) throw new Error(error)
  if (!address) throw new Error('No address returned from Freighter')
  saveAddress(address)
  return address
}

export async function getFreighterAddress(): Promise<string | null> {
  try {
    const allowed = await freighterApi.isAllowed()
    if (!allowed.isAllowed) return loadSavedAddress()
    const { address, error } = await freighterApi.getAddress()
    if (error || !address) return loadSavedAddress()
    saveAddress(address)
    return address
  } catch {
    return loadSavedAddress()
  }
}

export async function ensureReceiverFunded(network: StellarNetworkId, receiver = DEFAULT_RECEIVER) {
  const cfg = getNetworkConfig(network)
  const server = new Horizon.Server(cfg.horizonUrl)
  try {
    await server.loadAccount(receiver)
    return
  } catch {
    if (!cfg.friendbotUrl) {
      throw new Error(
        'Treasury account is not funded on Mainnet yet. Send XLM to the Evernet receiver address first, then retry.',
      )
    }
    const res = await fetch(`${cfg.friendbotUrl}?addr=${encodeURIComponent(receiver)}`)
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Could not fund testnet treasury: ${text}`)
    }
  }
}

function buildMemo(planId: string, buyer: string): string {
  // Horizon text memos max 28 bytes
  const shortBuyer = buyer.slice(-6)
  const stamp = Date.now().toString(36).slice(-6)
  return `EVN:${planId}:${shortBuyer}:${stamp}`.slice(0, 28)
}

export type PaymentResult = {
  hash: string
  explorerUrl: string
  memo: string
  plan: StoragePlan
  network: StellarNetworkId
  from: string
  to: string
  amount: string
}

export async function purchaseStoragePlan(
  plan: StoragePlan,
  network: StellarNetworkId,
  receiver = DEFAULT_RECEIVER,
): Promise<PaymentResult> {
  const cfg = getNetworkConfig(network)
  const installed = await isFreighterInstalled()
  if (!installed) {
    throw new Error('Install the Freighter wallet extension to pay with XLM on Stellar.')
  }

  const address = await connectFreighter()

  // Ensure wallet is on the expected network
  const net = await freighterApi.getNetworkDetails()
  if (net.error) throw new Error(net.error)
  if (net.networkPassphrase && net.networkPassphrase !== cfg.passphrase) {
    throw new Error(
      `Freighter is set to ${net.network || 'a different network'}. Switch Freighter to Stellar ${cfg.label} and try again.`,
    )
  }

  await ensureReceiverFunded(network, receiver)

  const server = new Horizon.Server(cfg.horizonUrl)
  const account = await server.loadAccount(address)
  const fee = await server.fetchBaseFee()
  const memo = buildMemo(plan.id, address)

  const tx = new TransactionBuilder(account, {
    fee: fee.toString(),
    networkPassphrase: cfg.passphrase,
  })
    .addOperation(
      Operation.payment({
        destination: receiver,
        asset: Asset.native(),
        amount: plan.priceXlm,
      }),
    )
    .addMemo(Memo.text(memo))
    .setTimeout(180)
    .build()

  const signed = await freighterApi.signTransaction(tx.toXDR(), {
    networkPassphrase: cfg.passphrase,
    address,
  })
  if (signed.error) throw new Error(signed.error)
  if (!signed.signedTxXdr) throw new Error('Freighter did not return a signed transaction')

  const parsed = TransactionBuilder.fromXDR(signed.signedTxXdr, cfg.passphrase)
  const submit = await server.submitTransaction(parsed)

  if (!submit.successful) {
    throw new Error('Stellar payment was submitted but not successful')
  }

  return {
    hash: submit.hash,
    explorerUrl: cfg.explorerTx(submit.hash),
    memo,
    plan,
    network,
    from: address,
    to: receiver,
    amount: plan.priceXlm,
  }
}
