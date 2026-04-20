import { describe, expect, it } from 'vitest'
import { tenantLocalDate } from './tz'

describe('tenantLocalDate', () => {
  it('returns YYYY-MM-DD in Asia/Ho_Chi_Minh (UTC+7, no DST)', () => {
    const ts = new Date('2026-04-20T20:00:00Z') // 03:00 local next day in ICT
    expect(tenantLocalDate(ts, 'Asia/Ho_Chi_Minh')).toBe('2026-04-21')
  })

  it('returns YYYY-MM-DD in Asia/Ho_Chi_Minh just before midnight-cross', () => {
    const before = new Date('2026-04-20T16:59:59Z')
    expect(tenantLocalDate(before, 'Asia/Ho_Chi_Minh')).toBe('2026-04-20')

    const after = new Date('2026-04-20T17:00:00Z')
    expect(tenantLocalDate(after, 'Asia/Ho_Chi_Minh')).toBe('2026-04-21')
  })

  it('handles DST spring-forward in America/New_York (2026-03-08, EST→EDT)', () => {
    // 06:00 UTC = 02:00 EDT (the hour 02:00-03:00 is "skipped" locally; 02:00 local == 06:00 UTC post-shift).
    const ts = new Date('2026-03-08T06:00:00Z')
    expect(tenantLocalDate(ts, 'America/New_York')).toBe('2026-03-08')
  })

  it('handles DST fall-back in America/New_York (2026-11-01, EDT→EST)', () => {
    // 05:00 UTC on the DST day — before switch (01:00 EDT → still Nov 1 local).
    const ts = new Date('2026-11-01T05:00:00Z')
    expect(tenantLocalDate(ts, 'America/New_York')).toBe('2026-11-01')
  })

  it('returns the same date when called in UTC', () => {
    const ts = new Date('2026-07-15T12:34:56Z')
    expect(tenantLocalDate(ts, 'UTC')).toBe('2026-07-15')
  })

  it('throws on an unknown IANA timezone', () => {
    expect(() => tenantLocalDate(new Date(), 'Mars/Olympus_Mons')).toThrow()
  })
})
