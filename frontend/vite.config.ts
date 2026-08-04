import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

// Backend (NestJS) port — keep in sync with backend/.env
const API_TARGET = process.env.VITE_API_TARGET ?? 'http://localhost:3006'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: API_TARGET,
        changeOrigin: true,
        // SSE must stream through untouched.
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            if (
              String(proxyRes.headers['content-type']).includes(
                'text/event-stream',
              )
            ) {
              proxyRes.headers['cache-control'] = 'no-cache, no-transform'
            }
          })
        },
      },
    },
  },
})
