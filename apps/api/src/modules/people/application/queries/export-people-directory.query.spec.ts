import { describe, expect, it } from 'vitest'
import { exportPeopleDirectory, EXPORT_ROW_LIMIT } from './export-people-directory.query'
import type { PeopleDirectoryRow } from './list-people-directory.query'

const makeRow = (i: number): PeopleDirectoryRow => ({
  id: `01900000-0000-7fff-8000-${String(i).padStart(12, '0')}`,
  fullName: `Person ${i}`,
  department: 'Engineering',
  jobTitle: 'Engineer',
  status: 'active',
  employmentType: 'permanent',
})

const baseInput = {
  resourceKey: 'people.directory' as const,
  search: '',
  filters: [],
  sorting: [],
}

describe('exportPeopleDirectory', () => {
  it('returns EXPORT_LIMIT_EXCEEDED when injected rows exceed 1000', () => {
    const largeRows = Array.from({ length: EXPORT_ROW_LIMIT + 1 }, (_, i) => makeRow(i))

    const result = exportPeopleDirectory(baseInput, largeRows)

    expect(result).toEqual({
      code: 'EXPORT_LIMIT_EXCEEDED',
      limit: 1000,
      message: expect.any(String),
    })
  })

  it('returns EXPORT_LIMIT_EXCEEDED for exactly 1001 rows', () => {
    const rows = Array.from({ length: 1001 }, (_, i) => makeRow(i))

    const result = exportPeopleDirectory(baseInput, rows)

    expect(result).toHaveProperty('code', 'EXPORT_LIMIT_EXCEEDED')
    expect((result as { limit: number }).limit).toBe(1000)
  })

  it('does NOT return EXPORT_LIMIT_EXCEEDED for exactly 1000 rows', () => {
    const rows = Array.from({ length: 1000 }, (_, i) => makeRow(i))

    const result = exportPeopleDirectory(baseInput, rows)

    expect(result).not.toHaveProperty('code')
    expect(result).toHaveProperty('filename', 'people-directory.csv')
    expect(result).toHaveProperty('csv')
  })

  it('returns CSV with correct headers for injected rows', () => {
    const rows = [makeRow(1), makeRow(2)]

    const result = exportPeopleDirectory(baseInput, rows) as { filename: string; csv: string }

    expect(result.filename).toBe('people-directory.csv')
    expect(result.csv).toContain('fullName')
    expect(result.csv).toContain('Person 1')
    expect(result.csv).toContain('Person 2')
  })

  it('EXPORT_ROW_LIMIT constant is 1000', () => {
    expect(EXPORT_ROW_LIMIT).toBe(1000)
  })
})
