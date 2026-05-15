import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import { defineConfig } from 'vite'

const gitSha = process.env.GIT_SHA ?? 'dev'

export default defineConfig({
  plugins: [
    tanstackRouter({
      routesDirectory: 'src/routes',
      generatedRouteTree: 'src/routeTree.gen.ts',
    }),
    tailwindcss(),
  ],
  define: {
    'import.meta.env.VITE_PUBLIC_BUILD_SHA': JSON.stringify(gitSha),
  },
  server: {
    port: 5173,
    proxy: {
      '/me': { target: 'http://localhost:8080', changeOrigin: true },
      '/sso': { target: 'http://localhost:8080', changeOrigin: true },
      '/oauth': { target: 'http://localhost:8080', changeOrigin: true },
      '/runs': { target: 'http://localhost:8080', changeOrigin: true },
      '/tenants/api': { target: 'http://localhost:8080', changeOrigin: true },
      '/agent': { target: 'http://localhost:8080', changeOrigin: true },
      '/audit': { target: 'http://localhost:8080', changeOrigin: true },
      '/rag': { target: 'http://localhost:8080', changeOrigin: true },
    },
  },
  build: {
    sourcemap: true,
    reportCompressedSize: true,
  },
})
