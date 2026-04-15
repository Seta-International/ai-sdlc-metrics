import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    passWithNoTests: true,
    include: ['src/**/*.spec.ts', 'src/**/*.spec.tsx'],
    environment: 'happy-dom',
    setupFiles: ['./src/test/setup.ts'],
  },
})
