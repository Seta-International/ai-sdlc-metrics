#!/usr/bin/env tsx
import 'dotenv/config'

const args = process.argv.slice(2)
const connectorsArg = args.find((a) => a.startsWith('--connectors='))?.split('=')[1]
const apiBase = process.env.API_BASE ?? 'http://localhost:8080'

if (!connectorsArg) {
  console.error(
    'usage: pnpm tsx tooling/scripts/connect-tenant.ts --connectors=ms365-planner,ms365-directory',
  )
  process.exit(1)
}

const res = await fetch(`${apiBase}/oauth/entra/consent-url`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    connectors: connectorsArg.split(',').map((s) => s.trim()),
  }),
})

if (!res.ok) {
  console.error(`request failed (${res.status}): ${await res.text()}`)
  process.exit(1)
}

const { url, state } = (await res.json()) as { url: string; state: string }
console.error(`state: ${state}`) // for log correlation
console.log(url)
