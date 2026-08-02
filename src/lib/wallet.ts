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

function kitNetwork(network: StellarNetworkId): KitNetworks {
  return network === 'public' ? KitNetworks.PUBLIC : KitNetworks.TESTNET
}

let initialized = false
let initializedNetwork: StellarNetworkId | null = null

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
    return new WalletConnectModule({
      projectId,
      metadata: {
        name: 'Evernet',
        description: 'Wallet-linked decentralized storage on Stellar',
        url: window.location.origin,
        icons: [`${window.location.origin}/favicon.svg`],
      },
      allowedChains: [
        network === 'public'
          ? WalletConnectTargetChain.PUBLIC
          : WalletConnectTargetChain.TESTNET,
      ],
    }) as unknown as ModuleInterface
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
    return
  }

  const modules: ModuleInterface[] = defaultModules()
  const wc = await walletConnectModule(network)
  if (wc) modules.push(wc)

  StellarWalletsKit.init({
    modules,
    network: kitNetwork(network),
    theme: EVERNET_THEME,
    selectedWalletId: localStorage.getItem(LocalStorageKeys.selectedModuleId) || undefined,
    authModal: { showInstallLabel: true },
  })

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
    const { address } = await StellarWalletsKit.authModal()
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
    const { signedTxXdr } = await StellarWalletsKit.signTransaction(xdr, {
      address,
      networkPassphrase: getNetworkConfig(network).passphrase,
    })
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
