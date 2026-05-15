import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  deepMergeWorkingMemory,
  mergeWorkingMemoryConfig,
  resolveWorkingMemoryTemplate,
} from './working-memory'

describe('working memory helpers', () => {
  it('resolves markdown templates by default', () => {
    expect(resolveWorkingMemoryTemplate({ enabled: true, template: '- Name:' })).toEqual({
      format: 'markdown',
      content: '- Name:',
    })
  })

  it('resolves JSON schema templates from zod schemas', () => {
    const template = resolveWorkingMemoryTemplate({
      enabled: true,
      schema: z.object({ user: z.object({ name: z.string() }), score: z.number() }),
    })

    expect(template.format).toBe('json')
    expect(template.content).toMatchObject({
      type: 'object',
      properties: {
        user: expect.objectContaining({ type: 'object' }),
        score: expect.objectContaining({ type: 'number' }),
      },
    })
  })

  it('replaces schema atomically when merging working memory config', () => {
    const base = {
      enabled: true,
      scope: 'resource' as const,
      schema: { type: 'object', properties: { stale: { type: 'string' } } },
    }
    const override = {
      readOnly: true,
      schema: { type: 'object', properties: { fresh: { type: 'number' } } },
    }

    expect(mergeWorkingMemoryConfig(base, override)).toEqual({
      enabled: true,
      scope: 'resource',
      readOnly: true,
      schema: { type: 'object', properties: { fresh: { type: 'number' } } },
    })
  })
})

describe('deepMergeWorkingMemory', () => {
  describe('null/undefined/empty update handling', () => {
    it('returns shallow copy of existing when update is null', () => {
      const existing = { name: 'Alice', age: 30 }
      const result = deepMergeWorkingMemory(existing, null)

      expect(result).toEqual({ name: 'Alice', age: 30 })
      expect(result).not.toBe(existing)
    })

    it('returns shallow copy of existing when update is undefined', () => {
      const existing = { name: 'Bob', location: 'NYC' }
      const result = deepMergeWorkingMemory(existing, undefined)

      expect(result).toEqual({ name: 'Bob', location: 'NYC' })
      expect(result).not.toBe(existing)
    })

    it('returns shallow copy of existing when update is empty object', () => {
      const existing = { foo: 'bar', count: 42 }
      const result = deepMergeWorkingMemory(existing, {})

      expect(result).toEqual({ foo: 'bar', count: 42 })
      expect(result).not.toBe(existing)
    })

    it('returns empty object when both existing and update are null', () => {
      expect(deepMergeWorkingMemory(null, null)).toEqual({})
    })

    it('returns empty object when existing is null and update is empty', () => {
      expect(deepMergeWorkingMemory(null, {})).toEqual({})
    })

    it('returns empty object when existing is undefined and update is null', () => {
      expect(deepMergeWorkingMemory(undefined, null)).toEqual({})
    })
  })

  describe('basic merging', () => {
    it('merges new keys into existing object', () => {
      const result = deepMergeWorkingMemory({ name: 'Alice' }, { age: 25 })
      expect(result).toEqual({ name: 'Alice', age: 25 })
    })

    it('overwrites existing keys with update values', () => {
      const result = deepMergeWorkingMemory({ name: 'Alice', age: 25 }, { age: 26 })
      expect(result).toEqual({ name: 'Alice', age: 26 })
    })

    it('returns update when existing is null', () => {
      const result = deepMergeWorkingMemory(null, { name: 'Charlie', role: 'admin' })
      expect(result).toEqual({ name: 'Charlie', role: 'admin' })
    })

    it('returns update when existing is undefined', () => {
      const result = deepMergeWorkingMemory(undefined, { status: 'active' })
      expect(result).toEqual({ status: 'active' })
    })
  })

  describe('null value deletion', () => {
    it('deletes property when update value is null', () => {
      const result = deepMergeWorkingMemory(
        { name: 'Alice', location: 'Seattle', age: 30 },
        { location: null },
      )
      expect(result).toEqual({ name: 'Alice', age: 30 })
      expect('location' in result).toBe(false)
    })

    it('deletes multiple properties when multiple null values', () => {
      const result = deepMergeWorkingMemory({ a: 1, b: 2, c: 3, d: 4 }, { b: null, d: null })
      expect(result).toEqual({ a: 1, c: 3 })
    })
  })

  describe('nested object merging', () => {
    it('recursively merges nested objects', () => {
      const result = deepMergeWorkingMemory(
        { about: { name: 'Alice', location: 'NYC' }, work: { company: 'Acme' } },
        { about: { age: 30 } },
      )
      expect(result).toEqual({
        about: { name: 'Alice', location: 'NYC', age: 30 },
        work: { company: 'Acme' },
      })
    })

    it('overwrites nested values', () => {
      const result = deepMergeWorkingMemory(
        { about: { name: 'Alice', location: 'NYC' } },
        { about: { location: 'LA' } },
      )
      expect(result).toEqual({ about: { name: 'Alice', location: 'LA' } })
    })

    it('deletes nested properties with null', () => {
      const result = deepMergeWorkingMemory(
        { about: { name: 'Alice', location: 'NYC', timezone: 'EST' } },
        { about: { location: null } },
      )
      expect(result).toEqual({ about: { name: 'Alice', timezone: 'EST' } })
    })

    it('creates nested objects when they do not exist', () => {
      const result = deepMergeWorkingMemory(
        { name: 'Alice' },
        { work: { company: 'Acme', role: 'Engineer' } },
      )
      expect(result).toEqual({ name: 'Alice', work: { company: 'Acme', role: 'Engineer' } })
    })
  })

  describe('array handling', () => {
    it('replaces arrays entirely instead of merging', () => {
      const result = deepMergeWorkingMemory(
        { people: [{ name: 'Alice', role: 'manager' }, { name: 'Bob', role: 'engineer' }] },
        { people: [{ name: 'Charlie', role: 'designer' }] },
      )
      expect(result).toEqual({ people: [{ name: 'Charlie', role: 'designer' }] })
    })

    it('allows setting an array where none existed', () => {
      const result = deepMergeWorkingMemory({ name: 'Alice' }, { tags: ['important', 'vip'] })
      expect(result).toEqual({ name: 'Alice', tags: ['important', 'vip'] })
    })

    it('replaces existing array with empty array', () => {
      const result = deepMergeWorkingMemory({ items: [1, 2, 3] }, { items: [] })
      expect(result).toEqual({ items: [] })
    })
  })

  describe('type coercion edge cases', () => {
    it('replaces object with primitive', () => {
      const result = deepMergeWorkingMemory({ data: { nested: 'value' } }, { data: 'simple string' })
      expect(result).toEqual({ data: 'simple string' })
    })

    it('replaces primitive with object', () => {
      const result = deepMergeWorkingMemory({ data: 'simple string' }, { data: { nested: 'value' } })
      expect(result).toEqual({ data: { nested: 'value' } })
    })

    it('replaces array with object', () => {
      const result = deepMergeWorkingMemory({ data: [1, 2, 3] }, { data: { key: 'value' } })
      expect(result).toEqual({ data: { key: 'value' } })
    })

    it('replaces object with array', () => {
      const result = deepMergeWorkingMemory({ data: { key: 'value' } }, { data: [1, 2, 3] })
      expect(result).toEqual({ data: [1, 2, 3] })
    })
  })

  describe('immutability', () => {
    it('does not mutate the existing object', () => {
      const existing = { name: 'Alice', nested: { a: 1 } }
      const existingCopy = JSON.parse(JSON.stringify(existing))
      deepMergeWorkingMemory(existing, { name: 'Bob', nested: { b: 2 } })
      expect(existing).toEqual(existingCopy)
    })

    it('does not mutate the update object', () => {
      const update = { age: 30, nested: { key: 'value' } }
      const updateCopy = JSON.parse(JSON.stringify(update))
      deepMergeWorkingMemory({ name: 'Alice' }, update)
      expect(update).toEqual(updateCopy)
    })
  })
})
