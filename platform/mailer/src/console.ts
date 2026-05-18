import type { Logger } from '@seta/observability'
import type { Mailer, OutboundMessage } from './types'

export interface ConsoleMailerOpts {
  logger: Pick<Logger, 'info'>
  defaultFrom?: string
}

export function createConsoleMailer(opts: ConsoleMailerOpts): Mailer {
  return {
    async send(msg: OutboundMessage): Promise<void> {
      opts.logger.info(
        {
          event: 'mailer.console_send',
          to: msg.to,
          from: msg.from ?? opts.defaultFrom,
          subject: msg.subject,
          body: msg.text,
          html_len: msg.html?.length ?? 0,
        },
        '[mailer] console send (no real delivery)',
      )
    },
  }
}
