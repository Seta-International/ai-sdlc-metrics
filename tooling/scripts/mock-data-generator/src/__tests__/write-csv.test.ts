import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { writeCsv } from '../write-csv.js'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'mockcsv-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('writeCsv', () => {
  it('writes header and rows', () => {
    const path = join(dir, 'out.csv')
    writeCsv(
      path,
      ['a', 'b'],
      [
        { a: '1', b: 'two' },
        { a: '3', b: 'four' },
      ],
    )
    expect(readFileSync(path, 'utf-8')).toBe('a,b\n1,two\n3,four\n')
  })

  it('escapes cells with commas, quotes, and newlines', () => {
    const path = join(dir, 'out.csv')
    writeCsv(
      path,
      ['a', 'b'],
      [
        { a: 'plain', b: 'has,comma' },
        { a: 'has "quote"', b: 'has\nnewline' },
      ],
    )
    expect(readFileSync(path, 'utf-8')).toBe(
      'a,b\nplain,"has,comma"\n"has ""quote""","has\nnewline"\n',
    )
  })

  it('serializes JSON fields when the value is not a string', () => {
    const path = join(dir, 'out.csv')
    writeCsv(path, ['a', 'b'], [{ a: 'x', b: [{ text: 'one', done: false }] }])
    expect(readFileSync(path, 'utf-8')).toBe('a,b\nx,"[{""text"":""one"",""done"":false}]"\n')
  })

  it('preserves UTF-8 (Vietnamese diacritics)', () => {
    const path = join(dir, 'out.csv')
    writeCsv(path, ['name'], [{ name: 'Nguyễn Văn Nam' }])
    expect(readFileSync(path, 'utf-8')).toBe('name\nNguyễn Văn Nam\n')
  })
})
