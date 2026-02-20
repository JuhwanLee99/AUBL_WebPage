import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiUrl = (env.VITE_BACKEND_API_URL || '').trim()
  const isDefaultApiOrigin = /^https?:\/\/api\.aubl\.club\/?$/.test(apiUrl)
  const proxyTarget =
    env.VITE_BACKEND_PROXY_TARGET ||
    env.VITE_BACKEND_TEST_URL ||
    (apiUrl && !isDefaultApiOrigin ? apiUrl : '') ||
    'http://localhost:8080'
  const isHttps = proxyTarget.startsWith('https://')
  const secureProxy = isHttps && env.VITE_BACKEND_PROXY_SECURE !== 'false'
  const shouldSpoofOrigin = env.VITE_BACKEND_PROXY_SPOOF_ORIGIN === 'true'
  const proxyOrigin = (() => {
    try {
      return new URL(proxyTarget).origin
    } catch {
      return proxyTarget
    }
  })()

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
          secure: secureProxy,
          ...(shouldSpoofOrigin
            ? {
                headers: {
                  origin: proxyOrigin,
                  referer: proxyOrigin + '/',
                },
              }
            : {}),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              if (shouldSpoofOrigin) return
              // Remove browser CORS headers in dev-proxy mode.
              proxyReq.removeHeader('origin')
              proxyReq.removeHeader('referer')
            })
          },
        },
      },
    },
  }
})
