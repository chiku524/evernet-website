import { useEffect, useState } from 'react'
import {
  type PassphraseMode,
  unlockVaultPassphrase,
} from '../../lib/vault-passphrase'

type Props = {
  open: boolean
  address: string
  reason?: 'unlock' | 'retry'
  onUnlocked: (passphrase: string) => void
  onClose: () => void
}

export function PassphraseModal({ open, address, reason = 'unlock', onUnlocked, onClose }: Props) {
  const [mode, setMode] = useState<PassphraseMode>('custom')
  const [passphrase, setPassphrase] = useState('')
  const [confirm, setConfirm] = useState('')
  const [remember, setRemember] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    setPassphrase('')
    setConfirm('')
  }, [open])

  if (!open) return null

  function submit() {
    setError(null)
    try {
      if (mode === 'custom' && passphrase !== confirm) {
        throw new Error('Passphrases do not match')
      }
      const pass = unlockVaultPassphrase({
        mode,
        passphrase,
        remember,
        address,
      })
      onUnlocked(pass)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not unlock vault')
    }
  }

  return (
    <div className="pay-overlay" role="dialog" aria-modal="true" aria-labelledby="pass-title">
      <button type="button" className="pay-backdrop" aria-label="Close" onClick={onClose} />
      <div className="pay-modal dash-folder-modal">
        <header className="pay-head">
          <div>
            <p className="pay-eyebrow">Encryption</p>
            <h2 id="pass-title">{reason === 'retry' ? 'Wrong passphrase' : 'Vault passphrase'}</h2>
          </div>
          <button type="button" className="pay-close" onClick={onClose}>
            Close
          </button>
        </header>
        <p className="pay-lead">
          {reason === 'retry'
            ? 'Decryption failed. Enter the passphrase used when this file was encrypted.'
            : 'Files are encrypted in your browser before upload. Use a personal passphrase (recommended), or convenience mode derived from your wallet address.'}
        </p>

        <label className="dash-folder-field">
          Mode
          <select value={mode} onChange={(e) => setMode(e.target.value as PassphraseMode)}>
            <option value="custom">Personal passphrase (recommended)</option>
            <option value="convenience">Convenience (wallet-derived)</option>
          </select>
        </label>

        {mode === 'custom' && (
          <>
            <label className="dash-folder-field">
              Passphrase
              <input
                type="password"
                autoComplete="new-password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                placeholder="At least 8 characters"
                autoFocus
              />
            </label>
            <label className="dash-folder-field">
              Confirm
              <input
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submit()
                }}
              />
            </label>
          </>
        )}

        <label className="dash-pass-remember">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          Remember on this device
        </label>

        {error && <p className="dash-empty-error" style={{ marginBottom: '0.75rem' }}>{error}</p>}

        <button type="button" className="dash-btn primary pay-cta" onClick={submit}>
          Unlock vault
        </button>
      </div>
    </div>
  )
}
