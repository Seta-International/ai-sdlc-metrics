export interface MailMessage {
  to: string | string[]
  subject: string
  html: string
  from?: string
  replyTo?: string
  attachments?: MailAttachment[]
}

export interface MailAttachment {
  filename: string
  content: Buffer
  contentType: string
}

export interface MailResult {
  messageId: string
  accepted: string[]
  rejected: string[]
}

export interface MailTransport {
  send(message: MailMessage): Promise<MailResult>
}

export interface SesMailConfig {
  provider: 'ses'
  fromAddress: string
  region: string
}

export interface SmtpMailConfig {
  provider: 'smtp'
  fromAddress: string
  smtpHost: string
  smtpPort: number
  smtpUser: string
  smtpPass: string
}

export type MailConfig = SesMailConfig | SmtpMailConfig
