import { defineProject } from 'vitest/config'

export default defineProject({
  test: {
    name: '@seta/portal',
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
})
