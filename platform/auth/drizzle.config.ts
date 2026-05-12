import 'dotenv/config'
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema.ts',
  out: './migrations',
  schemaFilter: ['auth'],
  dbCredentials: { url: process.env.DATABASE_URL! },
  verbose: true,
  strict: true,
})
