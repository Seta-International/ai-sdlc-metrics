import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getRecordingMode } from './mode'

describe('getRecordingMode', () => {
  const original = process.env.RECORD

  beforeEach(() => {
    delete process.env.RECORD
  })

  afterEach(() => {
    if (original === undefined) delete process.env.RECORD
    else process.env.RECORD = original
  })

  it('returns "replay" when RECORD is unset', () => {
    expect(getRecordingMode()).toBe('replay')
  })

  it('returns "record" when RECORD=1', () => {
    process.env.RECORD = '1'
    expect(getRecordingMode()).toBe('record')
  })

  it('returns "force" when RECORD=force', () => {
    process.env.RECORD = 'force'
    expect(getRecordingMode()).toBe('force')
  })

  it('returns "replay" for any other RECORD value', () => {
    process.env.RECORD = 'true'
    expect(getRecordingMode()).toBe('replay')
    process.env.RECORD = 'yes'
    expect(getRecordingMode()).toBe('replay')
    process.env.RECORD = ''
    expect(getRecordingMode()).toBe('replay')
  })

  it('is case-sensitive — RECORD=FORCE does not match', () => {
    process.env.RECORD = 'FORCE'
    expect(getRecordingMode()).toBe('replay')
  })
})
