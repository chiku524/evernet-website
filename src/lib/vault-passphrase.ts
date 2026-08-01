import { walletPassphrase } from './crypto'

const MODE_KEY = 'evernet-vault-pass-mode'
const PASS_KEY = 'evernet-vault-pass'
const REMEMBER_KEY = 'evernet-vault-pass-remember'

export type PassphraseMode = 'custom' | 'convenience'

export function getPassphraseMode(): PassphraseMode {
  return sessionStorage.getItem(MODE_KEY) === 'convenience' ||
    localStorage.getItem(MODE_KEY) === 'convenience'
    ? 'convenience'
    : 'custom'
}

export function hasUnlockedPassphrase(): boolean {
  if (getPassphraseMode() === 'convenience') return true
  return Boolean(sessionStorage.getItem(PASS_KEY) || localStorage.getItem(PASS_KEY))
}

export function clearVaultPassphrase() {
  sessionStorage.removeItem(PASS_KEY)
  sessionStorage.removeItem(MODE_KEY)
  localStorage.removeItem(PASS_KEY)
  localStorage.removeItem(MODE_KEY)
  localStorage.removeItem(REMEMBER_KEY)
}

export function unlockVaultPassphrase(input: {
  mode: PassphraseMode
  passphrase?: string
  remember?: boolean
  address: string
}): string {
  if (input.mode === 'convenience') {
    const pass = walletPassphrase(input.address)
    sessionStorage.setItem(MODE_KEY, 'convenience')
    if (input.remember) localStorage.setItem(MODE_KEY, 'convenience')
    else localStorage.removeItem(MODE_KEY)
    sessionStorage.removeItem(PASS_KEY)
    localStorage.removeItem(PASS_KEY)
    return pass
  }
  const pass = (input.passphrase || '').trim()
  if (pass.length < 8) {
    throw new Error('Passphrase must be at least 8 characters')
  }
  sessionStorage.setItem(MODE_KEY, 'custom')
  sessionStorage.setItem(PASS_KEY, pass)
  if (input.remember) {
    localStorage.setItem(MODE_KEY, 'custom')
    localStorage.setItem(PASS_KEY, pass)
    localStorage.setItem(REMEMBER_KEY, '1')
  } else {
    localStorage.removeItem(MODE_KEY)
    localStorage.removeItem(PASS_KEY)
    localStorage.removeItem(REMEMBER_KEY)
  }
  return pass
}

/** Resolve the active encryption passphrase for this wallet session. */
export function resolveVaultPassphrase(address: string): string | null {
  const mode = getPassphraseMode()
  if (mode === 'convenience') return walletPassphrase(address)
  return sessionStorage.getItem(PASS_KEY) || localStorage.getItem(PASS_KEY)
}
