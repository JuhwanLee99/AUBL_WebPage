import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const proxyTarget =
    env.VITE_BACKEND_PROXY_TARGET ||
    env.VITE_BACKEND_API_URL ||
    env.VITE_BACKEND_TEST_URL ||
    'http://localhost:8080'
  const isHttps = proxyTarget.startsWith('https://')

  return {
    plugins: [
      react({
        babel: {
          plugins: [],
        },
      }),
    ],
    server: {
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
          secure: isHttps,
        },
      },
    },
  }
})
