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
const XBULL_ID = 'xbull'
/** Popup / WalletConnect wallets can lose the reply when the tab is backgrounded. */
const WALLET_SIGN_TIMEOUT_MS = 90_000
const WALLET_CONNECT_TIMEOUT_MS = 120_000
const WC_SIGN_TIMEOUT_MS = WALLET_SIGN_TIMEOUT_MS

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

export function clearWalletConnectPendingAuth() {
  /* kept for Dashboard disconnect call sites — no pending-auth resume anymore */
}

export function isWalletConnectSelected(): boolean {
  try {
    return localStorage.getItem(LocalStorageKeys.selectedModuleId) === WC_ID
  } catch {
    return false
  }
}

export function isXBullSelected(): boolean {
  try {
    return localStorage.getItem(LocalStorageKeys.selectedModuleId) === XBULL_ID
  } catch {
    return false
  }
}

function selectedWalletId(): string | null {
  try {
    return localStorage.getItem(LocalStorageKeys.selectedModuleId)
  } catch {
    return null
  }
}

function walletActionTimeoutMessage(action: 'connect' | 'sign'): string {
  if (isXBullSelected()) {
    return action === 'sign'
      ? 'xBull did not return the signature. Approve in the xBull window and keep it open until this page updates — or open evernet.tech inside the xBull browser, then try again.'
      : 'xBull did not finish connecting. Keep the xBull window open until Evernet updates, then try again.'
  }
  if (isWalletConnectSelected()) {
    return action === 'sign'
      ? 'LOBSTR did not return the signature. In LOBSTR open ≡ → WalletConnect, stay on that screen, then try Connect again.'
      : 'WalletConnect did not finish connecting. Return to this tab after approving, then try again.'
  }
  return action === 'sign'
    ? 'Wallet did not return a signature in time. Approve the request and return to this tab, then try again.'
    : 'Wallet did not finish connecting in time. Try again.'
}

function wcChainLabel(chain: string): string {
  if (chain === 'pubnet') return 'Mainnet'
  if (chain === 'testnet') return 'Testnet'
  return chain
}

/**
 * WalletConnect sessions encode the network in the CAIP account
 * (`stellar:testnet:G…` / `stellar:pubnet:G…`). Signing on the wrong chain
 * produces a valid-looking approval that fails SEP-10 verify.
 */
export async function assertWalletConnectChain(
  network: StellarNetworkId,
  address?: string,
): Promise<void> {
  if (!isWalletConnectSelected() || !walletConnectInstance) return
  const anyMod = walletConnectInstance as ModuleInterface & {
    getSessions?: () => Promise<Array<{ topic: string; namespaces?: { stellar?: { accounts?: string[] } } }>>
  }
  if (!anyMod.getSessions) return
  await hydrateWalletConnectSessions(walletConnectInstance).catch(() => undefined)
  const sessions = await anyMod.getSessions().catch(() => [])
  const expected = network === 'public' ? 'pubnet' : 'testnet'
  const expectedLabel = getNetworkConfig(network).label

  for (const session of sessions || []) {
    for (const account of session.namespaces?.stellar?.accounts || []) {
      const parts = account.split(':')
      const chain = parts[1]
      const publicKey = parts[2]
      if (!chain || !publicKey) continue
      if (address && publicKey !== address) continue
      if (chain !== expected) {
        throw new Error(
          `LOBSTR is connected on ${wcChainLabel(chain)}, but Evernet is on ${expectedLabel}. In LOBSTR open ≡ → WalletConnect, disconnect Evernet, switch the wallet to ${expectedLabel}, then connect again.`,
        )
      }
    }
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
        description: 'Wallet-linked data integrity infrastructure on Stellar',
        url: window.location.origin,
        icons: [`${window.location.origin}/favicon.svg`],
      },
      // One chain only — LOBSTR signs with the session chain passphrase. Dual-chain
      // pairing let pubnet sessions sign testnet SEP-10 challenges → "Invalid signature".
      allowedChains: [
        network === 'public' ? WalletConnectTargetChain.PUBLIC : WalletConnectTargetChain.TESTNET,
      ],
    }) as unknown as ModuleInterface

    // Patch signTransaction for response-shape normalization + timeout (no auto-retry).
    const originalSign = mod.signTransaction.bind(mod)
    mod.signTransaction = async (xdr: string, opts?: { address?: string; networkPassphrase?: string }) => {
      await waitForWalletConnectReady(mod)
      await hydrateWalletConnectSessions(mod)

      const result = await withTimeout(
        originalSign(xdr, opts),
        WC_SIGN_TIMEOUT_MS,
        walletActionTimeoutMessage('sign'),
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
  if (err instanceof Error) {
    // xBull cancels RxJS waiters with EmptyError when the popup closes before replying.
    if (/no elements in sequence|EmptyError/i.test(err.message)) {
      return new Error(
        isXBullSelected()
          ? 'xBull window closed before returning a signature. Approve and leave the window open until Evernet updates.'
          : 'Wallet window closed before finishing. Try connecting again.',
      )
    }
    return err
  }
  const message = (err as { message?: string })?.message
  if (message && /no elements in sequence|EmptyError/i.test(message)) {
    return new Error(
      isXBullSelected()
        ? 'xBull window closed before returning a signature. Approve and leave the window open until Evernet updates.'
        : 'Wallet window closed before finishing. Try connecting again.',
    )
  }
  return new Error(message || fallback)
}

/** Opens the wallet picker. Resolves with the connected address. */
export async function connectWallet(network: StellarNetworkId): Promise<string> {
  await initWalletKit(network)
  try {
    if (walletConnectInstance) {
      await waitForWalletConnectReady(walletConnectInstance)
    }
    const { address } = await withTimeout(
      StellarWalletsKit.authModal(),
      WALLET_CONNECT_TIMEOUT_MS,
      walletActionTimeoutMessage('connect'),
    )
    if (isWalletConnectSelected() && walletConnectInstance) {
      await hydrateWalletConnectSessions(walletConnectInstance).catch(() => undefined)
      await assertWalletConnectChain(network, address)
    }
    return address
  } catch (err) {
    const base = kitError(err, 'Wallet connection cancelled')
    if (isXBullSelected() && isMobileClient() && !isWalletInAppBrowser()) {
      throw new Error(
        `${base.message} On mobile, open evernet.tech inside the xBull app browser for the most reliable connect.`,
      )
    }
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
  networkPassphrase?: string,
): Promise<string> {
  await initWalletKit(network)
  const passphrase = networkPassphrase || getNetworkConfig(network).passphrase
  try {
    if (isWalletConnectSelected() && walletConnectInstance) {
      await hydrateWalletConnectSessions(walletConnectInstance)
      await assertWalletConnectChain(network, address)
    }
    // WalletConnect module already applies its own timeout; still wrap for xBull/Albedo popups.
    const { signedTxXdr } = await withTimeout(
      StellarWalletsKit.signTransaction(xdr, {
        address,
        networkPassphrase: passphrase,
      }),
      WALLET_SIGN_TIMEOUT_MS,
      walletActionTimeoutMessage('sign'),
    )
    if (!signedTxXdr) throw new Error('Wallet returned an empty signature')
    return signedTxXdr
  } catch (err) {
    throw kitError(err, 'Wallet declined the signature')
  }
}

/**
 * Wallets that expose a network selector (Freighter, xBull) can be pointed at
 * the wrong one; warn before a transaction is rejected by Horizon. Wallets
 * without a selector are skipped rather than blocking the user.
 */
export async function assertWalletNetwork(network: StellarNetworkId): Promise<void> {
  // xBull’s kit module rejects getNetwork; skip the round-trip entirely.
  if (selectedWalletId() === XBULL_ID) return

  const expected = getNetworkConfig(network)
  try {
    const details = await withTimeout(StellarWalletsKit.getNetwork(), 4_000, 'network-check-timeout')
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
