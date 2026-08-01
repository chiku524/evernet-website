import { useEffect, useMemo, useState } from 'react'
import { applySuccessfulPayment, listPurchases, type PurchaseRecord } from '../../lib/billing'
import { formatBytes } from '../../lib/vault'
import {
  DEFAULT_RECEIVER,
  STORAGE_PLANS,
  type StellarNetworkId,
  type StoragePlan,
  connectFreighter,
  getFreighterAddress,
  isFreighterInstalled,
  loadPreferredNetwork,
  purchaseStoragePlan,
  savePreferredNetwork,
  shortenAddress,
} from '../../lib/stellar'

type Props = {
  open: boolean
  onClose: () => void
  onPurchased: () => void
  showToast: (message: string) => void
}

export function BuyStorageModal({ open, onClose, onPurchased, showToast }: Props) {
  const [network, setNetwork] = useState<StellarNetworkId>(() => loadPreferredNetwork())
  const [address, setAddress] = useState<string | null>(null)
  const [hasFreighter, setHasFreighter] = useState<boolean | null>(null)
  const [selected, setSelected] = useState<StoragePlan>(STORAGE_PLANS[1])
  const [paying, setPaying] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastTx, setLastTx] = useState<string | null>(null)
  const purchases = useMemo(() => listPurchases().slice(0, 5), [open, lastTx])

  useEffect(() => {
    if (!open) return
    setError(null)
    setNetwork(loadPreferredNetwork())
    void (async () => {
      setHasFreighter(await isFreighterInstalled())
      setAddress(await getFreighterAddress())
    })()
  }, [open])

  if (!open) return null

  async function handleConnect() {
    setConnecting(true)
    setError(null)
    try {
      const addr = await connectFreighter()
      setAddress(addr)
      setHasFreighter(true)
      showToast('Freighter connected')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not connect Freighter')
    } finally {
      setConnecting(false)
    }
  }

  async function handlePay() {
    setPaying(true)
    setError(null)
    setLastTx(null)
    try {
      savePreferredNetwork(network)
      const result = await purchaseStoragePlan(selected, network)
      const record: PurchaseRecord = applySuccessfulPayment(result)
      setLastTx(result.explorerUrl)
      setAddress(result.from)
      onPurchased()
      showToast(`Purchased ${record.planName}: +${formatBytes(record.bytes)} via Stellar`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment failed')
    } finally {
      setPaying(false)
    }
  }

  return (
    <div className="pay-overlay" role="dialog" aria-modal="true" aria-labelledby="pay-title">
      <button type="button" className="pay-backdrop" aria-label="Close" onClick={onClose} />
      <div className="pay-modal">
        <header className="pay-head">
          <div>
            <p className="pay-eyebrow">Stellar payments</p>
            <h2 id="pay-title">Buy storage with XLM</h2>
          </div>
          <button type="button" className="pay-close" onClick={onClose} aria-label="Close">
            Close
          </button>
        </header>

        <p className="pay-lead">
          Pay the Evernet treasury on the Stellar network. Freighter signs a native XLM payment; quota unlocks after
          Horizon confirms the transaction.
        </p>

        <div className="pay-network" role="group" aria-label="Stellar network">
          {(['testnet', 'public'] as const).map((id) => (
            <button
              key={id}
              type="button"
              className={`pay-net-btn ${network === id ? 'active' : ''}`}
              onClick={() => {
                setNetwork(id)
                savePreferredNetwork(id)
              }}
            >
              {id === 'testnet' ? 'Testnet' : 'Mainnet'}
            </button>
          ))}
        </div>

        <div className="pay-wallet">
          <div>
            <strong>Wallet</strong>
            <p>
              {address ? (
                <>
                  Connected <code>{shortenAddress(address)}</code>
                </>
              ) : hasFreighter === false ? (
                <>
                  Freighter not detected ·{' '}
                  <a href="https://freighter.app" target="_blank" rel="noreferrer">
                    Install Freighter
                  </a>
                </>
              ) : (
                'Connect Freighter to continue'
              )}
            </p>
          </div>
          <button type="button" className="dash-btn ghost" onClick={() => void handleConnect()} disabled={connecting}>
            {address ? 'Reconnect' : connecting ? 'Connecting…' : 'Connect Freighter'}
          </button>
        </div>

        <div className="pay-plans">
          {STORAGE_PLANS.map((plan) => (
            <button
              key={plan.id}
              type="button"
              className={`pay-plan ${selected.id === plan.id ? 'selected' : ''} ${plan.popular ? 'popular' : ''}`}
              onClick={() => setSelected(plan)}
            >
              {plan.popular && <span className="pay-badge">Popular</span>}
              <strong>{plan.name}</strong>
              <span className="pay-bytes">+{formatBytes(plan.bytes)}</span>
              <span className="pay-price">{plan.priceXlm} XLM</span>
              <span className="pay-desc">{plan.description}</span>
            </button>
          ))}
        </div>

        <div className="pay-summary">
          <div>
            <span>Treasury</span>
            <code title={DEFAULT_RECEIVER}>{shortenAddress(DEFAULT_RECEIVER)}</code>
          </div>
          <div>
            <span>You pay</span>
            <strong>
              {selected.priceXlm} XLM · {network === 'public' ? 'Mainnet' : 'Testnet'}
            </strong>
          </div>
        </div>

        {error && <p className="pay-error">{error}</p>}
        {lastTx && (
          <p className="pay-success">
            Payment confirmed.{' '}
            <a href={lastTx} target="_blank" rel="noreferrer">
              View on StellarExpert
            </a>
          </p>
        )}

        <button
          type="button"
          className="dash-btn primary pay-cta"
          disabled={paying}
          onClick={() => void handlePay()}
        >
          {paying ? 'Confirm in Freighter…' : `Pay ${selected.priceXlm} XLM for +${formatBytes(selected.bytes)}`}
        </button>

        {purchases.length > 0 && (
          <div className="pay-history">
            <p className="pay-history-label">Recent purchases</p>
            <ul>
              {purchases.map((p) => (
                <li key={p.hash}>
                  <span>
                    {p.planName} · +{formatBytes(p.bytes)} · {p.amountXlm} XLM
                  </span>
                  <a href={p.explorerUrl} target="_blank" rel="noreferrer">
                    Tx
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="pay-footnote">
          {network === 'testnet'
            ? 'Testnet uses Friendbot-funded treasury & free test XLM from Freighter/Friendbot.'
            : 'Mainnet spends real XLM. Ensure Freighter is on Public Network and the treasury account is funded.'}
        </p>
      </div>
    </div>
  )
}
