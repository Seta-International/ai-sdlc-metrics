import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  schema: '../../apps/api/src/modules/**/infrastructure/schema/*.schema.ts',
  out: './drizzle/migrations',
  dbCredentials: {
    url: process.env['DATABASE_URL'] ?? (() => { throw new Error('DATABASE_URL is required for drizzle-kit') })(),
  },
})
