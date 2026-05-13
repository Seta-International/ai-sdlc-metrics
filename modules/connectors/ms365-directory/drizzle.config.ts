import 'dotenv/config'
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema.ts',
  out: './migrations',
  schemaFilter: ['connector_ms365_directory'],
  dbCredentials: { url: process.env.DATABASE_URL ?? 'postgres://seta:dev@localhost:5432/seta' },
  verbose: true,
  strict: true,
})
