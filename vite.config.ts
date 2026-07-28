import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Vite rejects requests whose Host header it does not recognise, which blocks
  // anything proxied through a Cloudflare tunnel. Allowing the tunnel domains
  // affects only the local dev/preview servers, never the built site.
  preview: {
    allowedHosts: ['.trycloudflare.com', '.cfargotunnel.com'],
  },
  server: {
    allowedHosts: ['.trycloudflare.com', '.cfargotunnel.com'],
  },
})
