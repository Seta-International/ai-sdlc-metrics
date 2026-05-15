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
    port: 5180,
  },
  base: '/studio/',
  build: {
    sourcemap: true,
    reportCompressedSize: true,
  },
})
