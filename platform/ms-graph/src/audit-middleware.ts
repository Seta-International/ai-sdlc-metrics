const PARENT_SEGMENTS: ReadonlySet<string> = new Set([
  'tasks',
  'plans',
  'buckets',
  'users',
  'groups',
])
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isParent(s: string | undefined): s is string {
  return s !== undefined && PARENT_SEGMENTS.has(s)
}

export function normalizePath(path: string): string {
  const parts = path.split('/')
  const result: string[] = []

  for (const part of parts) {
    const prev = result[result.length - 1]

    if (part !== '' && part !== 'details' && isParent(prev)) {
      result.push(':id')
      continue
    }

    if (part !== '' && UUID_PATTERN.test(part)) {
      result.push(':id')
      continue
    }

    result.push(part)
  }

  return result.join('/')
}
