#!/usr/bin/env tsx
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import 'dotenv/config'
import { runMigrations } from '@seta/db'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL not set')
  process.exit(1)
}

// pnpm --filter ... exec runs from tooling/, but migration folders live at
// repo root. Resolve repoRoot from this file's location (tooling/scripts/ → ../..).
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

await runMigrations({ url, roleName: 'platform_admin', repoRoot })
console.log('✓ migrations applied')
