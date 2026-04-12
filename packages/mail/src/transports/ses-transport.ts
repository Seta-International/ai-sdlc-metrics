import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2'
import type { MailTransport, MailMessage, MailResult, SesMailConfig } from '../types'

export class SesTransport implements MailTransport {
  private readonly ses: SESv2Client
  private readonly fromAddress: string

  constructor(config: SesMailConfig) {
    this.ses = new SESv2Client({ region: config.region })
    this.fromAddress = config.fromAddress
  }

  async send(message: MailMessage): Promise<MailResult> {
    const toAddresses = Array.isArray(message.to) ? message.to : [message.to]

    const result = await this.ses.send(
      new SendEmailCommand({
        FromEmailAddress: message.from ?? this.fromAddress,
        ReplyToAddresses: message.replyTo ? [message.replyTo] : undefined,
        Destination: { ToAddresses: toAddresses },
        Content: {
          Simple: {
            Subject: { Data: message.subject },
            Body: { Html: { Data: message.html } },
          },
        },
      }),
    )

    return {
      messageId: result.MessageId ?? '',
      accepted: toAddresses,
      rejected: [],
    }
  }
}
