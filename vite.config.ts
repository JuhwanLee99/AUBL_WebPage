import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const proxyTarget =
    env.VITE_BACKEND_PROXY_TARGET ||
    env.VITE_BACKEND_TEST_URL ||
    'http://localhost:8080'
  const isHttps = proxyTarget.startsWith('https://')

  return {
    resolve: {
      alias: {
        '@app': path.resolve(__dirname, 'src/app'),
        '@core': path.resolve(__dirname, 'src/core'),
        '@features': path.resolve(__dirname, 'src/features'),
        '@shared': path.resolve(__dirname, 'src/shared'),
      },
    },
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
