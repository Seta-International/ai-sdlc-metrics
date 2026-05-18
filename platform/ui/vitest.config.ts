import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: {
    name: '@seta/ui',
    environment: 'jsdom',
    environmentOptions: {
      jsdom: {
        url: 'http://localhost',
      },
    },
    setupFiles: ['./test/setup.ts'],
  },
})
