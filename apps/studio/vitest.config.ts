import { defineProject } from 'vitest/config'

export default defineProject({
  test: {
    name: 'studio',
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
