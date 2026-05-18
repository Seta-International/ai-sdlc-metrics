#!/usr/bin/env tsx
import { runMigrations } from '@seta/db'
import { repoRoot } from './_env'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL not set')
  process.exit(1)
}

await runMigrations({ url, roleName: 'platform_admin', repoRoot })
console.log('✓ migrations applied')
