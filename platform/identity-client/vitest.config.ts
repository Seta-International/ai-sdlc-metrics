import { defineProject } from 'vitest/config'

export default defineProject({
  test: {
    name: '@seta/identity-client',
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
})
