/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_STELLAR_NETWORK?: string
  readonly VITE_STELLAR_RECEIVER?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare global {
  // eslint-disable-next-line no-var
  var Buffer: typeof import('buffer').Buffer
}

export {}
