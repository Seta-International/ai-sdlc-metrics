import type { KernelMessage } from '@seta/agent-core'
import { describe, expect, it } from 'vitest'
import { trimToTokenBudget } from './recall'

const msg = (role: KernelMessage['role'], text: string): KernelMessage => ({
  role,
  content: [{ type: 'text', text }],
})

describe('trimToTokenBudget', () => {
  it('returns empty for empty input', () => {
    const r = trimToTokenBudget([], 1000)
    expect(r.kept).toEqual([])
    expect(r.droppedCount).toBe(0)
  })

  it('keeps all when total fits', () => {
    const msgs = [msg('user', 'hello'), msg('assistant', 'hi')]
    const r = trimToTokenBudget(msgs, 10_000)
    expect(r.kept).toHaveLength(2)
    expect(r.droppedCount).toBe(0)
  })

  it('drops oldest first', () => {
    const msgs = [msg('user', 'old chunk'), msg('assistant', 'old reply'), msg('user', 'new')]
    const r = trimToTokenBudget(msgs, 10)
    expect(r.droppedCount).toBeGreaterThan(0)
    expect(r.kept.at(-1)).toEqual(msgs.at(-1))
  })

  it('never strips the last user message', () => {
    const msgs = [
      msg('user', 'older context'),
      msg('assistant', 'older reply'),
      msg('user', 'recent question'),
      msg('assistant', 'tiny reply'),
    ]
    const r = trimToTokenBudget(msgs, 12)
    expect(
      r.kept.some(
        (m) =>
          m.role === 'user' &&
          m.content[0]?.type === 'text' &&
          m.content[0].text === 'recent question',
      ),
    ).toBe(true)
  })

  it('falls back to keeping the last message when no user message exists', () => {
    const msgs = [msg('assistant', 'a'), msg('assistant', 'b')]
    const r = trimToTokenBudget(msgs, 0)
    expect(r.kept).toHaveLength(1)
    expect(r.kept[0]).toEqual(msgs[1])
  })

  it('keeps single message even if it exceeds budget', () => {
    const msgs = [msg('user', 'somewhat longish content here')]
    const r = trimToTokenBudget(msgs, 1)
    expect(r.kept).toHaveLength(1)
    expect(r.droppedCount).toBe(0)
  })
})
