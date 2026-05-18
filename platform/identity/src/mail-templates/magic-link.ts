import { createHash } from 'node:crypto'
import type { OutboundMessage } from '@seta/mailer'

export function magicLinkMessage(opts: {
  to: string
  link: string
  tenantDisplayName: string
  expiresInMin: number
}): OutboundMessage {
  const subject = `Sign in to ${opts.tenantDisplayName}`
  const text = [
    `Click the link below to sign in. It expires in ${opts.expiresInMin} minutes and works only once.`,
    '',
    opts.link,
    '',
    `If you didn't request this, you can safely ignore this email.`,
  ].join('\n')
  const html = [
    `<p>Click the link below to sign in. It expires in ${opts.expiresInMin} minutes and works only once.</p>`,
    `<p><a href="${opts.link}">${opts.link}</a></p>`,
    `<p style="color:#666">If you didn't request this, you can safely ignore this email.</p>`,
  ].join('\n')
  return {
    to: opts.to,
    subject,
    text,
    html,
    idempotencyKey: createHash('sha256').update(opts.link).digest('hex').slice(0, 32),
  }
}
