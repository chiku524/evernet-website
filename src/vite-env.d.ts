/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_STELLAR_NETWORK?: string
  readonly VITE_STELLAR_RECEIVER?: string
  readonly VITE_STORAGE_CONTRACT_ID?: string
  readonly VITE_STORAGE_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare global {
  // eslint-disable-next-line no-var
  var Buffer: typeof import('buffer').Buffer
}

export {}
