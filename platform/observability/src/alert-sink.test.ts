import { describe, expect, it, vi } from 'vitest'
import { type AlertInput, type AlertSink, MultiSink } from './alert-sink.js'

describe('MultiSink', () => {
  it('fans out an alert to every registered sink', async () => {
    const a = vi.fn().mockResolvedValue(undefined)
    const b = vi.fn().mockResolvedValue(undefined)
    const sinks: AlertSink[] = [{ alert: a }, { alert: b }]
    const multi = new MultiSink(sinks)

    const input: AlertInput = { severity: 'warning', summary: 'test' }
    await multi.alert(input)

    expect(a).toHaveBeenCalledWith(input)
    expect(b).toHaveBeenCalledWith(input)
  })

  it('continues calling other sinks if one throws, and logs the rejection', async () => {
    const failing: AlertSink = { alert: vi.fn().mockRejectedValue(new Error('boom')) }
    const ok: AlertSink = { alert: vi.fn().mockResolvedValue(undefined) }
    const warn = vi.fn()
    const multi = new MultiSink([failing, ok], { warn })

    await multi.alert({ severity: 'critical', summary: 'partial-failure' })

    expect(failing.alert).toHaveBeenCalled()
    expect(ok.alert).toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      'alert sink failed',
    )
  })
})
