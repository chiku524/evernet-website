import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const root = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@evernet/sdk': path.resolve(root, 'sdk/src/index.ts'),
    },
  },
  define: {
    global: 'globalThis',
  },
  optimizeDeps: {
    include: ['buffer', '@stellar/stellar-sdk'],
  },
  build: {
    commonjsOptions: {
      include: [/node_modules/],
    },
  },
})
