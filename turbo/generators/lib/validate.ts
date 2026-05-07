import { isValidKebab } from './naming'
import type { Tree } from './tree'

export type ValidationResult = { ok: true } | { ok: false; reason: string }

const RESERVED = new Set([
  'api',
  'web',
  'shell',
  'core',
  'kernel',
  'db',
  'ui',
  'node',
  'default',
  'class',
  'function',
  'import',
  'export',
  'const',
  'let',
  'var',
  'true',
  'false',
])

export function validateName(name: string): ValidationResult {
  if (!isValidKebab(name)) {
    return { ok: false, reason: `name must be kebab-case (got "${name}")` }
  }
  return { ok: true }
}

export function validateNotReserved(name: string): ValidationResult {
  if (RESERVED.has(name)) {
    return { ok: false, reason: `name "${name}" is reserved` }
  }
  return { ok: true }
}

export function validateModuleDoesNotExist(tree: Tree, name: string): ValidationResult {
  const path = `apps/api/src/modules/${name}/${name}.module.ts`
  if (tree.exists(path)) {
    return { ok: false, reason: `module "${name}" already exists at ${path}` }
  }
  return { ok: true }
}

export function validateModuleExists(tree: Tree, name: string): ValidationResult {
  const path = `apps/api/src/modules/${name}/${name}.module.ts`
  if (!tree.exists(path)) {
    return { ok: false, reason: `module "${name}" does not exist at ${path}` }
  }
  return { ok: true }
}

export function validateZoneDoesNotExist(tree: Tree, name: string): ValidationResult {
  const path = `apps/web-${name}/package.json`
  if (tree.exists(path)) {
    return { ok: false, reason: `zone "web-${name}" already exists` }
  }
  return { ok: true }
}

export function runAll(results: ValidationResult[]): { ok: boolean; reasons: string[] } {
  const reasons = results.flatMap((r) => (r.ok ? [] : [r.reason]))
  return { ok: reasons.length === 0, reasons }
}
