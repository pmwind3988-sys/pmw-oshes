import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Keep in sync with index.html meta tag and vercel.json headers.
const CSP = "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self' data: https://*.sharepoint.com https://*.microsoftonline.com https://*.microsoft.com https://graph.microsoft.com wss://*.sharepoint.com; img-src 'self' data: blob: https:; frame-src 'self' https://*.sharepoint.com https://login.microsoftonline.com;"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    headers: {
      'Content-Security-Policy': CSP,
    },
  },
  define: {
    global: 'globalThis',
  },
})
