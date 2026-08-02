import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit/sdk'
import { defaultModules } from '@creit.tech/stellar-wallets-kit/modules/utils'
import {
  KitEventType,
  LocalStorageKeys,
  Networks as KitNetworks,
  type ModuleInterface,
  type SwkAppTheme,
} from '@creit.tech/stellar-wallets-kit/types'
import { getNetworkConfig, type StellarNetworkId } from './stellar'

/**
 * Matches the Evernet dashboard palette so the wallet modal doesn't look like a
 * third-party drop-in.
 */
const EVERNET_THEME: SwkAppTheme = {
  background: '#f4faf8',
  'background-secondary': '#ffffff',
  'foreground-strong': '#0b2e2f',
  foreground: '#1a3334',
  'foreground-secondary': '#4d6768',
  primary: '#2a8f7c',
  'primary-foreground': '#ffffff',
  transparent: 'transparent',
  lighter: '#f4faf8',
  light: '#e8f2f0',
  'light-gray': '#d3e3e0',
  gray: '#4d6768',
  danger: '#c46b3a',
  border: 'rgba(11, 46, 47, 0.14)',
  shadow: 'rgba(11, 46, 47, 0.18)',
  'border-radius': '6px',
  'font-family': "'Source Sans 3', 'Segoe UI', sans-serif",
}

const WC_ID = 'wallet_connect'
const WC_JUST_CONNECTED_KEY = 'evernet-wc-just-connected'
const WC_PENDING_AUTH_KEY = 'evernet-wc-pending-auth'
const WC_SIGN_TIMEOUT_MS = 120_000
const WC_SETTLE_MS = 2_200

function kitNetwork(network: StellarNetworkId): KitNetworks {
  return network === 'public' ? KitNetworks.PUBLIC : KitNetworks.TESTNET
}

let initialized = false
let initializedNetwork: StellarNetworkId | null = null
let walletConnectInstance: ModuleInterface | null = null

type WcSessionPath = { publicKey: string; topic: string }

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), ms)
    promise.then(
      (value) => {
        window.clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        window.clearTimeout(timer)
        reject(err)
      },
    )
  })
}

async function waitForWalletConnectReady(mod: ModuleInterface, attempts = 40): Promise<void> {
  for (let i = 0; i < attempts; i += 1) {
    if (await mod.isAvailable().catch(() => false)) return
    await sleep(100)
  }
  throw new Error('WalletConnect is still starting — wait a moment and try again')
}

/** Rebuild kit session paths from live SignClient sessions (survives tab freezes). */
async function hydrateWalletConnectSessions(mod: ModuleInterface): Promise<void> {
  const anyMod = mod as ModuleInterface & {
    getSessions?: () => Promise<Array<{ topic: string; namespaces?: { stellar?: { accounts?: string[] } } }>>
  }
  if (!anyMod.getSessions) return
  await waitForWalletConnectReady(mod)
  const sessions = await anyMod.getSessions()
  const paths: WcSessionPath[] = []
  for (const session of sessions || []) {
    for (const account of session.namespaces?.stellar?.accounts || []) {
      const publicKey = account.split(':')[2]
      if (publicKey && session.topic) paths.push({ publicKey, topic: session.topic })
    }
  }
  if (!paths.length) return
  const { wcSessionPaths } = await import('@creit.tech/stellar-wallets-kit/state')
  wcSessionPaths.value = paths
}

function markWalletConnectJustConnected(address: string) {
  try {
    sessionStorage.setItem(WC_JUST_CONNECTED_KEY, '1')
    sessionStorage.setItem(WC_PENDING_AUTH_KEY, JSON.stringify({ address, at: Date.now() }))
  } catch {
    /* private mode */
  }
}

export function clearWalletConnectPendingAuth() {
  try {
    sessionStorage.removeItem(WC_JUST_CONNECTED_KEY)
    sessionStorage.removeItem(WC_PENDING_AUTH_KEY)
  } catch {
    /* ignore */
  }
}

export function peekWalletConnectPendingAuth(): { address: string; at: number } | null {
  try {
    const raw = sessionStorage.getItem(WC_PENDING_AUTH_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { address?: string; at?: number }
    if (!parsed.address || !parsed.at) return null
    // Challenges expire in 5 minutes; keep a slightly shorter resume window
    if (Date.now() - parsed.at > 4 * 60 * 1000) {
      clearWalletConnectPendingAuth()
      return null
    }
    return { address: parsed.address, at: parsed.at }
  } catch {
    return null
  }
}

export function isWalletConnectSelected(): boolean {
  try {
    return localStorage.getItem(LocalStorageKeys.selectedModuleId) === WC_ID
  } catch {
    return false
  }
}

/**
 * WalletConnect needs a Reown project id and pulls in a large dependency tree,
 * so it is only loaded when the deployment actually configures one.
 */
async function walletConnectModule(network: StellarNetworkId): Promise<ModuleInterface | null> {
  const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID?.trim()
  if (!projectId) return null
  try {
    const { WalletConnectModule, WalletConnectTargetChain } = await import(
      '@creit.tech/stellar-wallets-kit/modules/wallet-connect'
    )
    const mod = new WalletConnectModule({
      projectId,
      metadata: {
        name: 'Evernet',
        description: 'Wallet-linked decentralized storage on Stellar',
        url: window.location.origin,
        icons: [`${window.location.origin}/favicon.svg`],
      },
      // Advertise both so LOBSTR can attach; prefer the active Evernet network first.
      allowedChains:
        network === 'public'
          ? [WalletConnectTargetChain.PUBLIC, WalletConnectTargetChain.TESTNET]
          : [WalletConnectTargetChain.TESTNET, WalletConnectTargetChain.PUBLIC],
    }) as unknown as ModuleInterface

    // Patch signTransaction for LOBSTR settle delay + response-shape + timeout.
    const originalSign = mod.signTransaction.bind(mod)
    mod.signTransaction = async (xdr: string, opts?: { address?: string; networkPassphrase?: string }) => {
      await waitForWalletConnectReady(mod)
      await hydrateWalletConnectSessions(mod)

      let justConnected = false
      try {
        justConnected = sessionStorage.getItem(WC_JUST_CONNECTED_KEY) === '1'
        if (justConnected) sessionStorage.removeItem(WC_JUST_CONNECTED_KEY)
      } catch {
        /* ignore */
      }
      if (justConnected) await sleep(WC_SETTLE_MS)

      const result = await withTimeout(
        originalSign(xdr, opts),
        WC_SIGN_TIMEOUT_MS,
        'LOBSTR did not return the signature. In LOBSTR open ≡ → WalletConnect, stay on that screen, then try Connect again.',
      )

      const anyResult = result as { signedTxXdr?: string; signedXDR?: string; xdr?: string }
      const signedTxXdr = anyResult.signedTxXdr || anyResult.signedXDR || anyResult.xdr
      if (!signedTxXdr) {
        throw new Error(
          'WalletConnect returned an empty signature. Disconnect Evernet in LOBSTR’s WalletConnect list and connect again.',
        )
      }
      return { signedTxXdr }
    }

    return mod
  } catch (err) {
    console.warn('WalletConnect module unavailable', err)
    return null
  }
}

export async function initWalletKit(network: StellarNetworkId): Promise<void> {
  if (initialized) {
    if (initializedNetwork !== network) {
      StellarWalletsKit.setNetwork(kitNetwork(network))
      initializedNetwork = network
    }
    if (walletConnectInstance) {
      await hydrateWalletConnectSessions(walletConnectInstance).catch(() => undefined)
    }
    return
  }

  const modules: ModuleInterface[] = defaultModules()
  const wc = await walletConnectModule(network)
  if (wc) {
    modules.push(wc)
    walletConnectInstance = wc
  }

  StellarWalletsKit.init({
    modules,
    network: kitNetwork(network),
    theme: EVERNET_THEME,
    selectedWalletId: localStorage.getItem(LocalStorageKeys.selectedModuleId) || undefined,
    authModal: { showInstallLabel: true },
  })

  if (walletConnectInstance) {
    await waitForWalletConnectReady(walletConnectInstance).catch(() => undefined)
    await hydrateWalletConnectSessions(walletConnectInstance).catch(() => undefined)
  }

  initialized = true
  initializedNetwork = network
}

/**
 * Static catalogue for docs/marketing. The connect dialog itself is driven by
 * the kit's live module list, which also reports what is installed.
 */
export const WALLET_CATALOGUE: { name: string; url: string; platforms: string }[] = [
  { name: 'Freighter', url: 'https://www.freighter.app/', platforms: 'Extension + mobile' },
  { name: 'LOBSTR', url: 'https://lobstr.co/', platforms: 'Mobile + extension' },
  { name: 'xBull', url: 'https://xbull.app/', platforms: 'Extension + web PWA' },
  { name: 'Albedo', url: 'https://albedo.link/', platforms: 'Web, no install' },
  { name: 'Rabet', url: 'https://rabet.io/', platforms: 'Extension' },
  { name: 'Hana', url: 'https://hanawallet.io/', platforms: 'Extension + mobile' },
  { name: 'Klever', url: 'https://klever.io/', platforms: 'Extension + mobile' },
  { name: 'OneKey', url: 'https://onekey.so/', platforms: 'Extension + hardware' },
  { name: 'Bitget Wallet', url: 'https://web3.bitget.com/', platforms: 'Extension + mobile' },
  { name: 'Fordefi', url: 'https://fordefi.com/', platforms: 'Institutional MPC' },
  { name: 'Cactus Link', url: 'https://cactuslink.xyz/', platforms: 'Extension' },
  { name: "D'CENT", url: 'https://dcentwallet.com/', platforms: 'Hardware + mobile' },
]

export type SupportedWallet = {
  id: string
  name: string
  icon: string
  url: string
  isAvailable: boolean
}

export async function listSupportedWallets(): Promise<SupportedWallet[]> {
  return (await StellarWalletsKit.refreshSupportedWallets()).map((w) => ({
    id: w.id,
    name: w.name,
    icon: w.icon,
    url: w.url,
    isAvailable: w.isAvailable,
  }))
}

function kitError(err: unknown, fallback: string): Error {
  if (err instanceof Error) return err
  const message = (err as { message?: string })?.message
  return new Error(message || fallback)
}

/** Opens the wallet picker. Resolves with the connected address. */
export async function connectWallet(network: StellarNetworkId): Promise<string> {
  await initWalletKit(network)
  try {
    if (walletConnectInstance) {
      await waitForWalletConnectReady(walletConnectInstance)
    }
    const { address } = await StellarWalletsKit.authModal()
    if (isWalletConnectSelected()) {
      markWalletConnectJustConnected(address)
      if (walletConnectInstance) {
        await hydrateWalletConnectSessions(walletConnectInstance).catch(() => undefined)
      }
    }
    return address
  } catch (err) {
    const base = kitError(err, 'Wallet connection cancelled')
    if (isMobileClient() && !isWalletInAppBrowser() && !walletConnectConfigured()) {
      throw new Error(
        `${base.message} On mobile, open evernet.tech inside LOBSTR / Freighter / xBull, or pick Albedo / LOBSTR in the dialog. WalletConnect QR is not enabled on this deploy yet.`,
      )
    }
    if (isMobileClient() && !isWalletInAppBrowser()) {
      throw new Error(
        `${base.message} Tip: use LOBSTR, Albedo, or xBull — or open this site in your wallet’s in-app browser.`,
      )
    }
    throw base
  }
}

/** Reconnects silently from the kit's persisted session, if there is one. */
export async function restoreWallet(network: StellarNetworkId): Promise<string | null> {
  await initWalletKit(network)
  try {
    const { address } = await StellarWalletsKit.getAddress()
    return address || null
  } catch {
    return null
  }
}

export async function disconnectWallet(): Promise<void> {
  clearWalletConnectPendingAuth()
  try {
    await StellarWalletsKit.disconnect()
  } catch {
    /* nothing connected */
  }
}

export async function openWalletProfile(): Promise<void> {
  try {
    await StellarWalletsKit.profileModal()
  } catch {
    /* nothing connected */
  }
}

export async function signTransactionXdr(
  xdr: string,
  address: string,
  network: StellarNetworkId,
): Promise<string> {
  await initWalletKit(network)
  try {
    if (isWalletConnectSelected() && walletConnectInstance) {
      await hydrateWalletConnectSessions(walletConnectInstance)
    }
    const { signedTxXdr } = await StellarWalletsKit.signTransaction(xdr, {
      address,
      networkPassphrase: getNetworkConfig(network).passphrase,
    })
    if (!signedTxXdr) throw new Error('Wallet returned an empty signature')
    return signedTxXdr
  } catch (err) {
    const base = kitError(err, 'Wallet declined the signature')
    if (isWalletConnectSelected()) {
      throw new Error(
        `${base.message} For LOBSTR: keep ≡ → WalletConnect open while signing, then return to this tab.`,
      )
    }
    throw base
  }
}

/**
 * Wallets that expose a network selector (Freighter, xBull) can be pointed at
 * the wrong one; warn before a transaction is rejected by Horizon. Wallets
 * without a selector are skipped rather than blocking the user.
 */
export async function assertWalletNetwork(network: StellarNetworkId): Promise<void> {
  const expected = getNetworkConfig(network)
  try {
    const details = await StellarWalletsKit.getNetwork()
    if (details.networkPassphrase && details.networkPassphrase !== expected.passphrase) {
      throw new Error(
        `Your wallet is on ${details.network || 'another network'}. Switch it to Stellar ${expected.label} and try again.`,
      )
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Your wallet is on')) throw err
  }
}

export function onWalletStateChange(
  callback: (address: string | undefined) => void,
): () => void {
  return StellarWalletsKit.on(KitEventType.STATE_UPDATED, (event) => {
    callback(event.payload.address)
  })
}

export function isMobileClient(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  if (/Android|iPhone|iPad|iPod|Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua)) return true
  try {
    return window.matchMedia('(max-width: 820px) and (pointer: coarse)').matches
  } catch {
    return false
  }
}

/** True when Evernet was opened inside a wallet’s embedded browser (injected provider). */
export function isWalletInAppBrowser(): boolean {
  if (typeof window === 'undefined') return false
  const w = window as Window & {
    freighter?: unknown
    stellar?: unknown
    xBullSDK?: unknown
    hanaWallet?: unknown
  }
  return Boolean(w.freighter || w.stellar || w.xBullSDK || w.hanaWallet)
}

export function walletConnectConfigured(): boolean {
  return Boolean(import.meta.env.VITE_WALLETCONNECT_PROJECT_ID?.trim())
}
