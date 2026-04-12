import { randomUUID } from 'node:crypto'
import { extname } from 'node:path'

export interface KeyParts {
  tenantId: string
  category: 'avatars' | 'documents' | 'cv' | 'exports' | 'temp'
  module?: string
  entityId?: string
  fileName: string
}

export function buildKey(parts: KeyParts): string {
  const ext = extname(parts.fileName)
  // UUID v4 intentional: random prefixes avoid S3 hot-shard partitioning.
  // S3 keys are not DB identifiers; the repo's UUID v7 rule does not apply here.
  const id = randomUUID()
  const segments = [parts.tenantId, parts.category]

  if (parts.module) segments.push(parts.module)
  if (parts.entityId) segments.push(parts.entityId)

  segments.push(`${id}${ext}`)
  return segments.join('/')
}
