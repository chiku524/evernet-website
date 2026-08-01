import {
  Asset,
  Horizon,
  Memo,
  Networks,
  Operation,
  TransactionBuilder,
} from '@stellar/stellar-sdk'
import { assertWalletNetwork, signTransactionXdr } from './wallet'

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

export const DEFAULT_RECEIVER =
  import.meta.env.VITE_STELLAR_RECEIVER?.trim() ||
  'GCUBXGWBBJ4I276JPFQMBJIB5ZR4RJOV47C3YRWZHWITVQXJQKCW72D7'

export const STORAGE_CONTRACT_ID =
  import.meta.env.VITE_STORAGE_CONTRACT_ID?.trim() ||
  'CBWJEDHDK2UBMF4UXLWIANQ3I6CZ4IRFZPSS2257GZL53TD46LNLEQGO'

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

/** StellarExpert transaction URL (Testnet = Stellar’s public test network). */
export function explorerTxUrl(txHash: string, network: StellarNetworkId = loadPreferredNetwork()): string {
  return getNetworkConfig(network).explorerTx(txHash)
}

/** Contract page on StellarExpert when we only have a content hash. */
export function explorerContractUrl(
  contractId: string = STORAGE_CONTRACT_ID,
  network: StellarNetworkId = loadPreferredNetwork(),
): string {
  const slug = network === 'public' ? 'public' : 'testnet'
  return `https://stellar.expert/explorer/${slug}/contract/${contractId}`
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

/** Build + sign + submit XLM payment. Quota credit happens via storage API / Soroban. */
export async function purchaseStoragePlan(
  plan: StoragePlan,
  network: StellarNetworkId,
  address: string,
  receiver = DEFAULT_RECEIVER,
): Promise<PaymentResult> {
  const cfg = getNetworkConfig(network)

  await assertWalletNetwork(network)
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

  const signedXdr = await signTransactionXdr(tx.toXDR(), address, network)
  const parsed = TransactionBuilder.fromXDR(signedXdr, cfg.passphrase)
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
