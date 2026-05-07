import { describe, it } from 'vitest'
import { execSync } from 'node:child_process'

const RUN_E2E = process.env['RUN_GENERATOR_E2E'] === '1'
const maybe = RUN_E2E ? it : it.skip

describe('generator e2e (gated by RUN_GENERATOR_E2E=1)', () => {
  maybe(
    'module create → typecheck → remove → git clean',
    () => {
      const repo = process.cwd()
      execSync('bunx turbo gen module --name e2e-test', { cwd: repo, stdio: 'inherit' })
      execSync('bun install', { cwd: repo, stdio: 'inherit' })
      execSync('bun run --filter=api typecheck', { cwd: repo, stdio: 'inherit' })
      execSync('bunx turbo gen remove --kind module --name e2e-test', {
        cwd: repo,
        stdio: 'inherit',
      })
      execSync('git diff --exit-code', { cwd: repo, stdio: 'inherit' })
    },
    600_000,
  )
})
