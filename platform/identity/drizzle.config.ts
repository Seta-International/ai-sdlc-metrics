import 'dotenv/config'
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './migrations',
  schemaFilter: ['auth'],
  dbCredentials: { url: process.env.DATABASE_URL ?? 'postgres://seta:dev@localhost:5432/seta' },
  verbose: true,
  strict: true,
})
