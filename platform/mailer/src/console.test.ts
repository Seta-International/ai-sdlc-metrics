import { describe, expect, it, vi } from 'vitest'
import { createConsoleMailer } from './console'

describe('createConsoleMailer', () => {
  it('logs a structured line and returns ok', async () => {
    const info = vi.fn()
    const logger = { info, warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
    const m = createConsoleMailer({ logger: logger as never })
    await m.send({ to: 'a@b.com', subject: 'Hi', text: 'body' })
    expect(info).toHaveBeenCalled()
    const [payload] = info.mock.calls[0]!
    expect(payload).toMatchObject({ event: 'mailer.console_send', to: 'a@b.com', subject: 'Hi' })
  })
})
