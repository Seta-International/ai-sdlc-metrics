import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: '@seta/ms-teams',
    include: ['src/**/*.test.ts'],
  },
})
