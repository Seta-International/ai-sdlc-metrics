import { describe, it, expect } from 'vitest'
import { mapMsTaskDetailsToDomain } from './ms-task-details.mapper'

describe('mapMsTaskDetailsToDomain', () => {
  it('maps description, previewType and etag', () => {
    const ms = {
      id: 't1',
      description: 'Do the thing',
      previewType: 'description',
      checklist: {},
      references: {},
      '@odata.etag': 'W/"details-etag"',
    }
    const result = mapMsTaskDetailsToDomain(ms)
    expect(result.msTaskId).toBe('t1')
    expect(result.msDetailsEtag).toBe('W/"details-etag"')
    expect(result.description).toBe('Do the thing')
    expect(result.previewType).toBe('description')
  })

  it('maps checklist entries', () => {
    const ms = {
      id: 't2',
      '@odata.etag': 'W/"e"',
      checklist: {
        'item-1': { title: 'Step one', isChecked: true, orderHint: ' 8585!' },
        'item-2': { title: 'Step two', isChecked: false, orderHint: ' 9999!' },
      },
      references: {},
    }
    const result = mapMsTaskDetailsToDomain(ms)
    expect(result.checklist).toHaveLength(2)
    const item1 = result.checklist.find((c) => c.id === 'item-1')!
    expect(item1.title).toBe('Step one')
    expect(item1.isChecked).toBe(true)
    expect(item1.orderHint).toBe(' 8585!')
  })

  it('maps references entries', () => {
    const ms = {
      id: 't3',
      '@odata.etag': 'W/"e"',
      checklist: {},
      references: {
        'https%3A%2F%2Fexample.com': { alias: 'Example', type: 'PowerPoint' },
      },
    }
    const result = mapMsTaskDetailsToDomain(ms)
    expect(result.references).toHaveLength(1)
    expect(result.references[0].encodedUrl).toBe('https%3A%2F%2Fexample.com')
    expect(result.references[0].alias).toBe('Example')
    expect(result.references[0].type).toBe('PowerPoint')
  })

  it('throws on missing id', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => mapMsTaskDetailsToDomain({ description: 'x' } as any)).toThrow(/id/)
  })

  it('defaults description to null when missing', () => {
    const ms = { id: 't4', '@odata.etag': 'W/"e"' }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = mapMsTaskDetailsToDomain(ms as any)
    expect(result.description).toBeNull()
  })

  it('defaults previewType to automatic when missing', () => {
    const ms = { id: 't5', '@odata.etag': 'W/"e"' }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = mapMsTaskDetailsToDomain(ms as any)
    expect(result.previewType).toBe('automatic')
  })

  it('defaults etag to empty string when missing', () => {
    const ms = { id: 't6' }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = mapMsTaskDetailsToDomain(ms as any)
    expect(result.msDetailsEtag).toBe('')
  })

  it('defaults checklist and references to empty arrays when missing', () => {
    const ms = { id: 't7' }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = mapMsTaskDetailsToDomain(ms as any)
    expect(result.checklist).toEqual([])
    expect(result.references).toEqual([])
  })

  it('defaults checklist item orderHint to " !" (MS minimum) when missing', () => {
    const ms = {
      id: 't9',
      '@odata.etag': 'W/"e"',
      checklist: {
        'item-1': { title: 'Step', isChecked: false },
      },
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = mapMsTaskDetailsToDomain(ms as any)
    expect(result.checklist[0].orderHint).toBe(' !')
  })

  it('handles null alias and type in references', () => {
    const ms = {
      id: 't8',
      references: {
        'https%3A%2F%2Fexample.com': {},
      },
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = mapMsTaskDetailsToDomain(ms as any)
    expect(result.references[0].alias).toBeNull()
    expect(result.references[0].type).toBeNull()
  })
})
