import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['src/**/*.spec.ts'],
          exclude: ['src/**/*.integration.spec.ts'],
        },
      },
      {
        test: {
          name: 'integration',
          include: ['src/**/*.integration.spec.ts'],
          setupFiles: ['src/test-setup.integration.ts'],
        },
      },
    ],
  },
})
