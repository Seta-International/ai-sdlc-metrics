import { describe, expect, it } from 'vitest'
import { createLogger } from './logger.js'

describe('createLogger', () => {
  it('redacts known sensitive paths', () => {
    const messages: unknown[] = []
    const logger = createLogger({
      level: 'info',
      destination: { write: (m) => messages.push(JSON.parse(m)) },
    })
    logger.info(
      { access_token: 'shh', refresh_token: 'shh', api_key: 'shh', normal: 'ok' },
      'hello',
    )
    const m = messages[0] as Record<string, unknown>
    expect(m.access_token).toBe('[REDACTED]')
    expect(m.refresh_token).toBe('[REDACTED]')
    expect(m.api_key).toBe('[REDACTED]')
    expect(m.normal).toBe('ok')
  })

  it('emits friendly string levels not numbers', () => {
    const messages: unknown[] = []
    const logger = createLogger({
      level: 'info',
      destination: { write: (m) => messages.push(JSON.parse(m)) },
    })
    logger.warn({ x: 1 }, 'warn msg')
    expect((messages[0] as Record<string, unknown>).level).toBe('warn')
  })
})
