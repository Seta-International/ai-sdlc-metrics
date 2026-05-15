import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: {
    name: '@seta/ui',
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
  },
})
