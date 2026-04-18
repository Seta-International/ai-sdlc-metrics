import { describe, expect, it } from 'vitest'
import { ChecklistItem } from './checklist-item.value-object'
import { TitleRequiredException } from '../exceptions/title-required.exception'
import { TitleTooLongException } from '../exceptions/title-too-long.exception'
import { MsOrderHint } from '../value-objects/ms-order-hint.vo'

const ORDER_HINT = MsOrderHint.between()

// ────────────────────────────────────────────────────────────────────────────
// ChecklistItem value object
// ────────────────────────────────────────────────────────────────────────────

describe('ChecklistItem value object', () => {
  describe('create()', () => {
    it('creates item with correct defaults', () => {
      const item = ChecklistItem.create({
        id: 'item-1',
        title: 'Do something',
        orderHint: ORDER_HINT,
      })
      expect(item.id).toBe('item-1')
      expect(item.title).toBe('Do something')
      expect(item.orderHint).toBe(ORDER_HINT)
      expect(item.isChecked).toBe(false)
    })

    it('throws TitleRequiredException on empty title', () => {
      expect(() =>
        ChecklistItem.create({ id: 'item-1', title: '', orderHint: ORDER_HINT }),
      ).toThrow(TitleRequiredException)
    })

    it('throws TitleTooLongException when title exceeds 255 chars', () => {
      expect(() =>
        ChecklistItem.create({ id: 'item-1', title: 'x'.repeat(256), orderHint: ORDER_HINT }),
      ).toThrow(TitleTooLongException)
    })

    it('accepts title of exactly 255 chars', () => {
      expect(() =>
        ChecklistItem.create({ id: 'item-1', title: 'x'.repeat(255), orderHint: ORDER_HINT }),
      ).not.toThrow()
    })

    it('accepts title of exactly 1 char', () => {
      expect(() =>
        ChecklistItem.create({ id: 'item-1', title: 'x', orderHint: ORDER_HINT }),
      ).not.toThrow()
    })
  })

  describe('reconstitute()', () => {
    it('restores all fields including isChecked', () => {
      const item = ChecklistItem.reconstitute({
        id: 'item-2',
        title: 'Restored item',
        isChecked: true,
        orderHint: ORDER_HINT,
      })
      expect(item.id).toBe('item-2')
      expect(item.title).toBe('Restored item')
      expect(item.isChecked).toBe(true)
      expect(item.orderHint).toBe(ORDER_HINT)
    })
  })

  describe('immutability', () => {
    it('properties are readonly', () => {
      const item = ChecklistItem.create({
        id: 'item-1',
        title: 'Do something',
        orderHint: ORDER_HINT,
      })
      // TypeScript enforces this at compile time; runtime check via Object.getOwnPropertyDescriptor
      const idDescriptor = Object.getOwnPropertyDescriptor(item, 'id')
      // 'readonly' in TS means the property exists but is not writable
      expect(() => {
        ;(item as Record<string, unknown>)['id'] = 'hacked'
      }).toThrow()
    })

    it('withChecked() returns a new instance without mutating the original', () => {
      const original = ChecklistItem.create({
        id: 'item-1',
        title: 'Do something',
        orderHint: ORDER_HINT,
      })
      const toggled = original.withChecked(true)
      expect(toggled.isChecked).toBe(true)
      expect(original.isChecked).toBe(false)
      expect(toggled).not.toBe(original)
    })

    it('withTitle() returns a new instance without mutating the original', () => {
      const original = ChecklistItem.create({
        id: 'item-1',
        title: 'Original',
        orderHint: ORDER_HINT,
      })
      const updated = original.withTitle('Updated')
      expect(updated.title).toBe('Updated')
      expect(original.title).toBe('Original')
      expect(updated).not.toBe(original)
    })

    it('withOrderHint() returns a new instance without mutating the original', () => {
      const original = ChecklistItem.create({
        id: 'item-1',
        title: 'Do something',
        orderHint: ORDER_HINT,
      })
      const newHint = MsOrderHint.between(ORDER_HINT, undefined)
      const reordered = original.withOrderHint(newHint)
      expect(reordered.orderHint).toBe(newHint)
      expect(original.orderHint).toBe(ORDER_HINT)
      expect(reordered).not.toBe(original)
    })
  })

  describe('equals()', () => {
    it('returns true for same id and same field values', () => {
      const a = ChecklistItem.reconstitute({
        id: 'item-1',
        title: 'Do something',
        isChecked: false,
        orderHint: ORDER_HINT,
      })
      const b = ChecklistItem.reconstitute({
        id: 'item-1',
        title: 'Do something',
        isChecked: false,
        orderHint: ORDER_HINT,
      })
      expect(a.equals(b)).toBe(true)
    })

    it('returns false for different id', () => {
      const a = ChecklistItem.reconstitute({
        id: 'item-1',
        title: 'Do something',
        isChecked: false,
        orderHint: ORDER_HINT,
      })
      const b = ChecklistItem.reconstitute({
        id: 'item-2',
        title: 'Do something',
        isChecked: false,
        orderHint: ORDER_HINT,
      })
      expect(a.equals(b)).toBe(false)
    })

    it('returns false for same id but different title', () => {
      const a = ChecklistItem.reconstitute({
        id: 'item-1',
        title: 'Title A',
        isChecked: false,
        orderHint: ORDER_HINT,
      })
      const b = ChecklistItem.reconstitute({
        id: 'item-1',
        title: 'Title B',
        isChecked: false,
        orderHint: ORDER_HINT,
      })
      expect(a.equals(b)).toBe(false)
    })

    it('returns false for same id but different isChecked', () => {
      const a = ChecklistItem.reconstitute({
        id: 'item-1',
        title: 'Do something',
        isChecked: false,
        orderHint: ORDER_HINT,
      })
      const b = ChecklistItem.reconstitute({
        id: 'item-1',
        title: 'Do something',
        isChecked: true,
        orderHint: ORDER_HINT,
      })
      expect(a.equals(b)).toBe(false)
    })

    it('returns false for same id but different orderHint', () => {
      const hintB = MsOrderHint.between(ORDER_HINT, undefined)
      const a = ChecklistItem.reconstitute({
        id: 'item-1',
        title: 'Do something',
        isChecked: false,
        orderHint: ORDER_HINT,
      })
      const b = ChecklistItem.reconstitute({
        id: 'item-1',
        title: 'Do something',
        isChecked: false,
        orderHint: hintB,
      })
      expect(a.equals(b)).toBe(false)
    })
  })

  describe('withTitle() validation', () => {
    it('throws TitleRequiredException when new title is empty', () => {
      const item = ChecklistItem.create({ id: 'item-1', title: 'Original', orderHint: ORDER_HINT })
      expect(() => item.withTitle('')).toThrow(TitleRequiredException)
    })

    it('throws TitleTooLongException when new title exceeds 255 chars', () => {
      const item = ChecklistItem.create({ id: 'item-1', title: 'Original', orderHint: ORDER_HINT })
      expect(() => item.withTitle('x'.repeat(256))).toThrow(TitleTooLongException)
    })
  })
})
