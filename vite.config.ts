import { defineConfig } from 'vite'
import { loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', 'VITE_')
  const target = env.VITE_DEV_PROXY_TARGET || 'http://localhost:4108'
  return {
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      port: 5178,
      strictPort: true,
      proxy: {
        '/api': { target },
        '/socket.io': { target, ws: true },
        '/uploads': { target },
      },
    },
  }
})
