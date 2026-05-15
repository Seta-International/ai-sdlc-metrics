import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { name: '@seta/tenancy', fileParallelism: false },
})
