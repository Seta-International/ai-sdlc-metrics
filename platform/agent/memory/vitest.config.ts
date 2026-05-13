import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: '@seta/agent-memory',
    // Integration tests truncate shared tables; serialize files so one
    // file's beforeEach does not wipe another file's in-flight data.
    fileParallelism: false,
    testTimeout: 30_000,
  },
})
