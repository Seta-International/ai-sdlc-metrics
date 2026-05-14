import { describe, expect, test } from 'vitest'
import { chunkBy } from './batch'

describe('chunkBy — basic shapes', () => {
  test('empty array returns no batches', () => {
    expect(chunkBy([], 10)).toEqual([])
  })

  test('single element returns one batch with one element', () => {
    expect(chunkBy(['a'], 10)).toEqual([['a']])
  })

  test('exact-multiple input returns batches of size exactly `size`', () => {
    const out = chunkBy(['a', 'b', 'c', 'd'], 2)
    expect(out).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ])
  })

  test('input shorter than size returns single batch with all elements', () => {
    expect(chunkBy(['a', 'b'], 10)).toEqual([['a', 'b']])
  })

  test('off-by-one input: 101 items, size 100 → [100, 1]', () => {
    const items = Array.from({ length: 101 }, (_, i) => `i${i}`)
    const out = chunkBy(items, 100)
    expect(out.length).toBe(2)
    expect(out[0]?.length).toBe(100)
    expect(out[1]?.length).toBe(1)
    expect(out[1]?.[0]).toBe('i100')
  })

  test('size 1: every element is its own batch', () => {
    expect(chunkBy(['a', 'b', 'c'], 1)).toEqual([['a'], ['b'], ['c']])
  })
})

describe('chunkBy — preserves order and content', () => {
  test('concatenation of batches equals the input (250 items, size 100)', () => {
    const items = Array.from({ length: 250 }, (_, i) => `i${i}`)
    const batches = chunkBy(items, 100)
    expect(batches.length).toBe(3)
    expect(batches.flat()).toEqual(items)
  })

  test('every batch (except possibly the last) is exactly `size`', () => {
    const items = Array.from({ length: 250 }, (_, i) => `i${i}`)
    const batches = chunkBy(items, 100)
    expect(batches.slice(0, -1).every((b) => b.length === 100)).toBe(true)
    expect(batches.at(-1)!.length).toBeLessThanOrEqual(100)
  })

  test('size 100 with 100 items: exactly one full batch (no empty trailing batch)', () => {
    const items = Array.from({ length: 100 }, (_, i) => `i${i}`)
    const batches = chunkBy(items, 100)
    expect(batches.length).toBe(1)
    expect(batches[0]?.length).toBe(100)
  })
})

describe('chunkBy — generic over element type', () => {
  test('works on number[] (type-level check via compilation)', () => {
    const nums: number[] = [1, 2, 3, 4, 5]
    const batches: number[][] = chunkBy(nums, 2)
    expect(batches).toEqual([[1, 2], [3, 4], [5]])
  })
})
