import { describe, expect, it } from 'vitest'
import { buildKey } from './key-builder'

describe('buildKey', () => {
  it('builds an avatar key', () => {
    const key = buildKey({
      tenantId: 'tenant-1',
      category: 'avatars',
      entityId: 'actor-1',
      fileName: 'photo.jpg',
    })
    expect(key).toMatch(/^tenant-1\/avatars\/actor-1\/[0-9a-f-]+\.jpg$/)
  })

  it('builds a document key', () => {
    const key = buildKey({
      tenantId: 'tenant-1',
      category: 'documents',
      module: 'hiring',
      entityId: 'candidate-1',
      fileName: 'resume.pdf',
    })
    expect(key).toMatch(/^tenant-1\/documents\/hiring\/candidate-1\/[0-9a-f-]+\.pdf$/)
  })

  it('builds a temp key', () => {
    const key = buildKey({
      tenantId: 'tenant-1',
      category: 'temp',
      fileName: 'upload.bin',
    })
    expect(key).toMatch(/^tenant-1\/temp\/[0-9a-f-]+\.bin$/)
  })

  it('extracts extension from fileName', () => {
    const key = buildKey({
      tenantId: 't',
      category: 'exports',
      fileName: 'report.xlsx',
    })
    expect(key).toMatch(/\.xlsx$/)
  })
})
