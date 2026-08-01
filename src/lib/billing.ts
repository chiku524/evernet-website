import type { PaymentResult, StellarNetworkId } from './stellar'

const QUOTA_KEY = 'evernet-storage-quota-bytes'
const PURCHASES_KEY = 'evernet-storage-purchases'
const BASE_QUOTA_BYTES = 5 * 1024 * 1024 * 1024

export type PurchaseRecord = {
  hash: string
  planId: string
  planName: string
  bytes: number
  amountXlm: string
  network: StellarNetworkId
  explorerUrl: string
  from: string
  at: number
}

export function getBaseQuotaBytes() {
  return BASE_QUOTA_BYTES
}

export function getPurchasedQuotaBytes(): number {
  try {
    const raw = localStorage.getItem(QUOTA_KEY)
    if (!raw) return 0
    const n = Number(raw)
    return Number.isFinite(n) && n > 0 ? n : 0
  } catch {
    return 0
  }
}

export function getTotalQuotaBytes(): number {
  return getBaseQuotaBytes() + getPurchasedQuotaBytes()
}

export function listPurchases(): PurchaseRecord[] {
  try {
    const raw = localStorage.getItem(PURCHASES_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as PurchaseRecord[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function hasProcessedPayment(hash: string): boolean {
  return listPurchases().some((p) => p.hash === hash)
}

export function applySuccessfulPayment(result: PaymentResult): PurchaseRecord {
  if (hasProcessedPayment(result.hash)) {
    throw new Error('This payment was already credited')
  }

  const record: PurchaseRecord = {
    hash: result.hash,
    planId: result.plan.id,
    planName: result.plan.name,
    bytes: result.plan.bytes,
    amountXlm: result.amount,
    network: result.network,
    explorerUrl: result.explorerUrl,
    from: result.from,
    at: Date.now(),
  }

  const purchases = [record, ...listPurchases()]
  localStorage.setItem(PURCHASES_KEY, JSON.stringify(purchases))
  localStorage.setItem(QUOTA_KEY, String(getPurchasedQuotaBytes() + result.plan.bytes))

  return record
}
