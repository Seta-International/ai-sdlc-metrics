import { describe, expect, it } from 'vitest'
import { WorkingMemoryTooLargeError } from './errors'
import { validateWorkingMemoryText } from './working-memory'

describe('validateWorkingMemoryText', () => {
  it('accepts an empty string', () => {
    expect(() => validateWorkingMemoryText('')).not.toThrow()
  })

  it('accepts 8192 bytes exactly', () => {
    expect(() => validateWorkingMemoryText('a'.repeat(8192))).not.toThrow()
  })

  it('throws WorkingMemoryTooLargeError at 8193 bytes', () => {
    expect(() => validateWorkingMemoryText('a'.repeat(8193))).toThrow(WorkingMemoryTooLargeError)
  })

  it('counts UTF-8 bytes, not characters', () => {
    // '€' is 3 UTF-8 bytes; 2731 × 3 = 8193 bytes.
    expect(() => validateWorkingMemoryText('€'.repeat(2731))).toThrow(WorkingMemoryTooLargeError)
  })
})
