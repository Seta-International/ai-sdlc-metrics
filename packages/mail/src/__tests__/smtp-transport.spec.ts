import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SmtpTransport } from '../transports/smtp-transport'

const mockSendMail = vi.fn()

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => ({ sendMail: mockSendMail })),
  },
}))

describe('SmtpTransport', () => {
  let transport: SmtpTransport

  beforeEach(() => {
    vi.clearAllMocks()
    mockSendMail.mockResolvedValue({
      messageId: 'smtp-msg-456',
      accepted: ['user@example.com'],
      rejected: [],
    })
    transport = new SmtpTransport({
      provider: 'smtp',
      fromAddress: 'noreply@seta.com',
      smtpHost: 'smtp.example.com',
      smtpPort: 587,
      smtpUser: 'user',
      smtpPass: 'pass',
    })
  })

  it('sends email via nodemailer', async () => {
    const result = await transport.send({
      to: 'user@example.com',
      subject: 'Test',
      html: '<p>Hello</p>',
    })

    expect(mockSendMail).toHaveBeenCalledOnce()
    expect(result.messageId).toBe('smtp-msg-456')
  })

  it('passes attachments to nodemailer', async () => {
    await transport.send({
      to: 'user@example.com',
      subject: 'Test',
      html: '<p>Hello</p>',
      attachments: [
        {
          filename: 'report.pdf',
          content: Buffer.from('pdf-data'),
          contentType: 'application/pdf',
        },
      ],
    })

    const callArgs = mockSendMail.mock.calls[0]![0]
    expect(callArgs.attachments).toHaveLength(1)
    expect(callArgs.attachments[0].filename).toBe('report.pdf')
  })

  it('propagates nodemailer errors', async () => {
    mockSendMail.mockRejectedValue(new Error('SMTP auth failed'))
    await expect(transport.send({ to: 'a@b.com', subject: 'Test', html: '<p/>' })).rejects.toThrow(
      'SMTP auth failed',
    )
  })
})
