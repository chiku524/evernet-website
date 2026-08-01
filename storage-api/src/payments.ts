import { Horizon } from '@stellar/stellar-sdk'
import { config } from './config.js'

export async function verifyStoragePayment(input: {
  txHash: string
  from: string
  planId: string
}): Promise<{ ok: true; paymentHashHex: string; amount: string } | { ok: false; error: string }> {
  const price = config.planPricesXlm[input.planId]
  if (!price) return { ok: false, error: 'Unknown plan' }

  const server = new Horizon.Server(config.horizonUrl)
  let tx: Horizon.ServerApi.TransactionRecord
  try {
    tx = await server.transactions().transaction(input.txHash).call()
  } catch {
    return { ok: false, error: 'Transaction not found on Horizon' }
  }

  if (!tx.successful) return { ok: false, error: 'Transaction not successful' }
  if (tx.source_account !== input.from) {
    return { ok: false, error: 'Transaction source does not match wallet' }
  }

  const ops = await server.operations().forTransaction(input.txHash).call()
  const payment = ops.records.find((op) => {
    if (op.type !== 'payment') return false
    const p = op as Horizon.ServerApi.PaymentOperationRecord
    return (
      p.to === config.treasuryPublic &&
      p.asset_type === 'native' &&
      Number(p.amount) >= Number(price)
    )
  }) as Horizon.ServerApi.PaymentOperationRecord | undefined

  if (!payment) {
    return {
      ok: false,
      error: `No native XLM payment of ≥ ${price} to treasury ${config.treasuryPublic}`,
    }
  }

  // Use first 32 bytes of tx hash hex (64 chars) as payment id
  const paymentHashHex = input.txHash.length >= 64 ? input.txHash.slice(0, 64) : input.txHash.padEnd(64, '0')

  return { ok: true, paymentHashHex, amount: payment.amount }
}
