import { describe, expect, it } from 'vitest'
import { assignEmails, nameToLocalPart } from '../email.js'

describe('nameToLocalPart', () => {
  it.each([
    ['Trần Văn Hùng', 'hung.tranvan'],
    ['Nguyễn Văn Nam', 'nam.nguyenvan'],
    ['Lê Thị Hoa', 'hoa.lethi'],
    ['Phạm Quốc Bảo', 'bao.phamquoc'],
    ['Vũ Minh Tuấn', 'tuan.vuminh'],
    ['Bùi Trung Hiếu', 'hieu.buitrung'],
    ['Đỗ Mỹ Linh', 'linh.domy'],
    ['Đinh Thanh Mai', 'mai.dinhthanh'],
    ['Lý Minh Hoàng', 'hoang.lyminh'],
    ['Vũ Bích Ngọc', 'ngoc.vubich'],
  ])('strips diacritics and concatenates family+middle (%s)', (name, expected) => {
    expect(nameToLocalPart(name)).toBe(expected)
  })

  it('handles 2-token names (no middle) by keeping only family', () => {
    expect(nameToLocalPart('Hoa Lê')).toBe('hoa.le')
    expect(nameToLocalPart('Nam Nguyễn')).toBe('nam.nguyen')
  })

  it('maps Đ/đ explicitly (NFD does not decompose these)', () => {
    expect(nameToLocalPart('Đỗ Mỹ Linh')).toBe('linh.domy')
    expect(nameToLocalPart('Đặng Văn Đức')).toBe('duc.dangvan')
  })

  it('throws when name has fewer than 2 tokens', () => {
    expect(() => nameToLocalPart('Hoa')).toThrow()
    expect(() => nameToLocalPart('')).toThrow()
  })
})

describe('assignEmails', () => {
  it('returns one email per input row in the same order', () => {
    const out = assignEmails(['Trần Văn Hùng', 'Nguyễn Văn Nam'])
    expect(out).toEqual([
      'hung.tranvan@setafuture.onmicrosoft.com',
      'nam.nguyenvan@setafuture.onmicrosoft.com',
    ])
  })

  it('appends suffix 2,3,... to later collisions in input order', () => {
    const out = assignEmails(['Trần Văn Hùng', 'Trần Văn Hùng', 'Trần Văn Hùng'])
    expect(out).toEqual([
      'hung.tranvan@setafuture.onmicrosoft.com',
      'hung.tranvan2@setafuture.onmicrosoft.com',
      'hung.tranvan3@setafuture.onmicrosoft.com',
    ])
  })

  it('respects pre-reserved emails when generating suffixes', () => {
    const reserved = new Set(['hung.tranvan@setafuture.onmicrosoft.com'])
    const out = assignEmails(['Trần Văn Hùng'], reserved)
    expect(out).toEqual(['hung.tranvan2@setafuture.onmicrosoft.com'])
  })

  it('produces all-unique emails', () => {
    const out = assignEmails(['Trần Văn Hùng', 'Trần Văn Hùng', 'Lê Thị Hoa'])
    expect(new Set(out).size).toBe(out.length)
  })
})
