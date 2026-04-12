import nodemailer from 'nodemailer'
import type { MailTransport, MailMessage, MailResult, SmtpMailConfig } from '../types'

export class SmtpTransport implements MailTransport {
  private readonly transporter: nodemailer.Transporter
  private readonly fromAddress: string

  constructor(config: SmtpMailConfig) {
    this.transporter = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpPort === 465,
      auth: { user: config.smtpUser, pass: config.smtpPass },
    })
    this.fromAddress = config.fromAddress
  }

  async send(message: MailMessage): Promise<MailResult> {
    const result = await this.transporter.sendMail({
      from: message.from ?? this.fromAddress,
      to: Array.isArray(message.to) ? message.to.join(', ') : message.to,
      replyTo: message.replyTo,
      subject: message.subject,
      html: message.html,
      attachments: message.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType,
      })),
    })

    return {
      messageId: result.messageId,
      accepted: (result.accepted ?? []) as string[],
      rejected: (result.rejected ?? []) as string[],
    }
  }
}
