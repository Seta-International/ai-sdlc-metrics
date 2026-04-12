import { SesTransport } from './transports/ses-transport'
import { SmtpTransport } from './transports/smtp-transport'
import type { MailConfig, MailTransport } from './types'

export function createMailTransport(config: MailConfig): MailTransport {
  switch (config.provider) {
    case 'ses':
      return new SesTransport(config)
    case 'smtp':
      return new SmtpTransport(config)
  }
}

export type {
  MailTransport,
  MailMessage,
  MailAttachment,
  MailResult,
  MailConfig,
  SesMailConfig,
  SmtpMailConfig,
} from './types'
export { renderMjmlTemplate } from './template'
export { SesTransport } from './transports/ses-transport'
export { SmtpTransport } from './transports/smtp-transport'
