#!/usr/bin/env tsx
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import 'dotenv/config'
import postgres from 'postgres'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL not set')
  process.exit(1)
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const initSql = readFileSync(resolve(repoRoot, 'infra/postgres/init.sql'), 'utf8')

const sql = postgres(url, { max: 1 })
try {
  await sql.unsafe(initSql)
  console.log('✓ db init applied')
} finally {
  await sql.end()
}
