export const ALIAS_MAP: Readonly<Record<string, string>> = {
  k8s: 'Kubernetes',
  ts: 'TypeScript',
  postgres: 'PostgreSQL',
  pg: 'PostgreSQL',
  js: 'JavaScript',
  node: 'Node.js',
}

export function normalizeSkill(skill: string): string {
  const trimmed = skill.trim()
  if (trimmed === '') return ''
  const canonical = ALIAS_MAP[trimmed.toLowerCase()]
  return canonical ?? trimmed
}

export function normalizeSkillsCsv(csv: string): string {
  if (csv === '') return ''
  const normalized = csv
    .split(',')
    .map((s) => normalizeSkill(s))
    .filter((s) => s !== '')
  return [...new Set(normalized)].join(',')
}
