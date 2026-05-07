import { execSync } from 'node:child_process'

export function buildTypecheckCommand(opts: { apiOnly?: boolean; zoneName?: string }): string {
  const filters = ['--filter=api']
  if (opts.zoneName) filters.push(`--filter=@future/web-${opts.zoneName}`)
  return `turbo run typecheck ${filters.join(' ')}`.trim()
}

export function buildLintCommand(opts: { targets: string[] }): string {
  const filters = opts.targets.map((t) => `--filter=${t}`).join(' ')
  return `turbo run lint ${filters} -- --fix`.trim()
}

export function runTypecheck(cwd: string, opts: Parameters<typeof buildTypecheckCommand>[0]): void {
  execSync(buildTypecheckCommand(opts), { cwd, stdio: 'inherit' })
}

export function runLint(cwd: string, opts: Parameters<typeof buildLintCommand>[0]): void {
  execSync(buildLintCommand(opts), { cwd, stdio: 'inherit' })
}
