#!/usr/bin/env tsx
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postgres from 'postgres'
import { repoRoot } from './_env'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL not set')
  process.exit(1)
}

const initSql = readFileSync(resolve(repoRoot, 'infra/postgres/init.sql'), 'utf8')

const sql = postgres(url, { max: 1, onnotice: () => {} })
try {
  await sql.unsafe(initSql)
  console.log('✓ db init applied')
} finally {
  await sql.end()
}
