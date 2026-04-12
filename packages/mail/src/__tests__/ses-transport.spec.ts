import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SesTransport } from '../transports/ses-transport'

const mockSend = vi.fn()

vi.mock('@aws-sdk/client-sesv2', () => {
  return {
    SESv2Client: class {
      send = mockSend
    },
    SendEmailCommand: class {
      input: unknown
      constructor(input: unknown) {
        this.input = input
      }
    },
  }
})

describe('SesTransport', () => {
  let transport: SesTransport

  beforeEach(() => {
    vi.clearAllMocks()
    mockSend.mockResolvedValue({ MessageId: 'ses-msg-123' })
    transport = new SesTransport({
      provider: 'ses',
      fromAddress: 'noreply@seta.com',
      region: 'ap-southeast-1',
    })
  })

  it('sends email via SESv2 SendEmailCommand', async () => {
    const result = await transport.send({
      to: 'user@example.com',
      subject: 'Test',
      html: '<p>Hello</p>',
    })

    expect(mockSend).toHaveBeenCalledOnce()
    expect(result.messageId).toBe('ses-msg-123')
    expect(result.accepted).toEqual(['user@example.com'])
  })

  it('uses from override when provided', async () => {
    await transport.send({
      to: 'user@example.com',
      subject: 'Test',
      html: '<p>Hello</p>',
      from: 'custom@seta.com',
    })

    const cmdInput = mockSend.mock.calls[0]![0].input
    expect(cmdInput.FromEmailAddress).toBe('custom@seta.com')
  })

  it('handles array of recipients', async () => {
    const result = await transport.send({
      to: ['a@example.com', 'b@example.com'],
      subject: 'Test',
      html: '<p>Hello</p>',
    })

    expect(result.accepted).toEqual(['a@example.com', 'b@example.com'])
  })

  it('propagates SES client errors', async () => {
    mockSend.mockRejectedValue(new Error('SES throttled'))
    await expect(transport.send({ to: 'a@b.com', subject: 'Test', html: '<p/>' })).rejects.toThrow(
      'SES throttled',
    )
  })
})
