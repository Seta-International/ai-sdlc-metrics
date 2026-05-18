export interface OutboundMessage {
  to: string | string[]
  subject: string
  text: string
  html?: string
  from?: string
  replyTo?: string
  headers?: Record<string, string>
  idempotencyKey?: string
}

export interface Mailer {
  send(msg: OutboundMessage): Promise<void>
}

export class MailerNotConfigured extends Error {
  constructor(public readonly tenantId: string) {
    super(`No mailer configured for tenant ${tenantId}`)
    this.name = 'MailerNotConfigured'
  }
}
