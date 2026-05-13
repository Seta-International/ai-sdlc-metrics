import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { name: '@seta/agent', exclude: ['tests/integration/**', 'node_modules/**'] },
})
