import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: '@seta/agent-sdk',
    setupFiles: ['./test/setup.ts'],
  },
})
