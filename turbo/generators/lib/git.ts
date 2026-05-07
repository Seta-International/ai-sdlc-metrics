import { execSync } from 'node:child_process'

export function parsePorcelain(out: string): string[] {
  return out
    .split('\n')
    .map((l) => l.slice(3).trim())
    .filter((l) => l.length > 0)
}

export function anyDirty(porcelainPaths: string[], targetPrefixes: string[]): boolean {
  return porcelainPaths.some((p) => targetPrefixes.some((prefix) => p.startsWith(prefix)))
}

export function gitStatusPorcelain(cwd: string): string[] {
  const out = execSync('git status --porcelain', { cwd, encoding: 'utf8' })
  return parsePorcelain(out)
}
