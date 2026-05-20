import { describe, expect, it } from 'vitest'
import { ALIAS_MAP, normalizeSkill, normalizeSkillsCsv } from '../aliases.js'

describe('normalizeSkill', () => {
  it('maps known aliases to canonical names', () => {
    expect(normalizeSkill('k8s')).toBe('Kubernetes')
    expect(normalizeSkill('ts')).toBe('TypeScript')
    expect(normalizeSkill('postgres')).toBe('PostgreSQL')
    expect(normalizeSkill('js')).toBe('JavaScript')
  })

  it('is case-insensitive on the alias side', () => {
    expect(normalizeSkill('K8S')).toBe('Kubernetes')
    expect(normalizeSkill('TS')).toBe('TypeScript')
  })

  it('passes unknown skills through unchanged', () => {
    expect(normalizeSkill('AWS')).toBe('AWS')
    expect(normalizeSkill('Spark')).toBe('Spark')
  })

  it('trims whitespace', () => {
    expect(normalizeSkill('  k8s  ')).toBe('Kubernetes')
  })
})

describe('normalizeSkillsCsv', () => {
  it('normalizes each skill in a comma-separated string', () => {
    expect(normalizeSkillsCsv('k8s,ts,AWS')).toBe('Kubernetes,TypeScript,AWS')
  })

  it('returns empty string unchanged', () => {
    expect(normalizeSkillsCsv('')).toBe('')
  })

  it('deduplicates after normalization', () => {
    expect(normalizeSkillsCsv('k8s,Kubernetes,K8S')).toBe('Kubernetes')
  })
})

describe('ALIAS_MAP', () => {
  it('contains the spec aliases', () => {
    expect(ALIAS_MAP).toMatchObject({
      k8s: 'Kubernetes',
      ts: 'TypeScript',
      postgres: 'PostgreSQL',
      js: 'JavaScript',
    })
  })
})
