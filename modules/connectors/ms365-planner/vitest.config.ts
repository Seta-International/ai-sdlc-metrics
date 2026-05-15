import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: '@seta/connector-ms365-planner',
    exclude: ['tests/integration/**', 'node_modules/**'],
  },
})
