import { useEffect, useState } from 'react'
import { confirmPurchase, loginWithFreighter, sessionAddress } from '../../lib/api'
import { formatBytes } from '../../lib/format'
import {
  DEFAULT_RECEIVER,
  FREIGHTER_DOWNLOAD_URL,
  STORAGE_CONTRACT_ID,
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
  wallet: string | null
}

export function BuyStorageModal({ open, onClose, onPurchased, showToast, wallet }: Props) {
  const [network, setNetwork] = useState<StellarNetworkId>(() => loadPreferredNetwork())
  const [address, setAddress] = useState<string | null>(wallet)
  const [hasFreighter, setHasFreighter] = useState<boolean | null>(null)
  const [selected, setSelected] = useState<StoragePlan>(STORAGE_PLANS[1])
  const [paying, setPaying] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastTx, setLastTx] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    setNetwork(loadPreferredNetwork())
    setAddress(wallet || sessionAddress())
    void (async () => {
      setHasFreighter(await isFreighterInstalled())
      if (!wallet) setAddress(await getFreighterAddress())
    })()
  }, [open, wallet])

  if (!open) return null

  async function ensureAuthed(addr: string) {
    if (sessionAddress() === addr) return
    await loginWithFreighter(addr)
  }

  async function handleConnect() {
    setConnecting(true)
    setError(null)
    try {
      const addr = await connectFreighter()
      await ensureAuthed(addr)
      setAddress(addr)
      setHasFreighter(true)
      showToast('Freighter connected · vault session started')
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
      const addr = address || (await connectFreighter())
      await ensureAuthed(addr)
      setAddress(addr)

      const payment = await purchaseStoragePlan(selected, network)
      const credited = await confirmPurchase(selected.id, payment.hash)
      setLastTx(credited.explorerUrl)
      onPurchased()
      showToast(
        `On-chain credit: +${formatBytes(selected.bytes)} (${credited.profile.source || 'profile'})`,
      )
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
            <p className="pay-eyebrow">Stellar + Soroban</p>
            <h2 id="pay-title">Buy storage with XLM</h2>
          </div>
          <button type="button" className="pay-close" onClick={onClose} aria-label="Close">
            Close
          </button>
        </header>

        <p className="pay-lead">
          Pay the Evernet treasury on Stellar. After Horizon confirms, the storage API credits your wallet’s Soroban
          profile (lease + quota).
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
            <strong>Wallet profile</strong>
            <p>
              {address ? (
                <>
                  Connected <code>{shortenAddress(address)}</code>
                </>
              ) : hasFreighter === false ? (
                <>
                  Freighter not detected ·{' '}
                  <a href={FREIGHTER_DOWNLOAD_URL} target="_blank" rel="noreferrer">
                    Install Freighter
                  </a>
                </>
              ) : (
                'Connect Freighter to bind storage to your address'
              )}
            </p>
          </div>
          <button type="button" className="dash-btn ghost" onClick={() => void handleConnect()} disabled={connecting}>
            {address
              ? 'Reconnect'
              : connecting
                ? 'Connecting…'
                : hasFreighter === false
                  ? 'Install Freighter'
                  : 'Connect Freighter'}
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
            <span>Contract</span>
            <code title={STORAGE_CONTRACT_ID}>{shortenAddress(STORAGE_CONTRACT_ID)}</code>
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
            Payment confirmed & quota credited.{' '}
            <a href={lastTx} target="_blank" rel="noreferrer">
              View on StellarExpert
            </a>
          </p>
        )}

        <button type="button" className="dash-btn primary pay-cta" disabled={paying} onClick={() => void handlePay()}>
          {paying ? 'Pay & credit on Soroban…' : `Pay ${selected.priceXlm} XLM for +${formatBytes(selected.bytes)}`}
        </button>

        <p className="pay-footnote">
          {network === 'testnet'
            ? 'Testnet: Friendbot treasury + free test XLM. Quota is written to the Evernet Soroban contract and mirrored by the storage API.'
            : 'Mainnet spends real XLM. Fund the treasury and set Freighter to Public Network first.'}
        </p>
      </div>
    </div>
  )
}
