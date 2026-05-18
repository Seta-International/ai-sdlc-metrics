import { createHash } from 'node:crypto'

/**
 * Structural shape matching `@seta/mailer`'s `OutboundMessage`. Defined locally
 * to avoid a build-graph cycle (`identity` → `mailer` → `ms-graph` → … → `identity`).
 * Callers pass a `Mailer` whose `send` accepts this shape.
 */
export type MagicLinkOutbound = {
  to: string
  subject: string
  text: string
  html?: string
  idempotencyKey?: string
}

export function magicLinkMessage(opts: {
  to: string
  link: string
  tenantDisplayName: string
  expiresInMin: number
}): MagicLinkOutbound {
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
