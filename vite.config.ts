import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
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
