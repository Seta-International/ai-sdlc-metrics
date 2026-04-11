/// <reference types="node" />
import { defineConfig } from 'drizzle-kit'

// DRIZZLE_SCHEMA_GLOB can be overridden in CI or other environments.
// Default points at apps/api — the only app that owns schema files today.
// When a second app introduces schemas, set the env var instead of editing this file.
const schemaGlob =
  process.env['DRIZZLE_SCHEMA_GLOB'] ??
  '../../apps/api/src/modules/**/infrastructure/schema/*.schema.ts'

export default defineConfig({
  dialect: 'postgresql',
  schema: schemaGlob,
  out: './drizzle/migrations',
  dbCredentials: {
    url:
      process.env['DATABASE_URL'] ??
      (() => {
        throw new Error('DATABASE_URL is required for drizzle-kit')
      })(),
  },
})
