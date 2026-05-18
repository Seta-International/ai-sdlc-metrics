import type { Mailer, OutboundMessage } from './types'

export type GraphFetch = (
  token: string,
  method: 'POST' | 'GET' | 'PATCH' | 'DELETE',
  url: string,
  body?: unknown,
) => Promise<Response>

export interface GraphMailerOpts {
  getToken: () => Promise<string>
  graphFetch: GraphFetch
  mailboxUserId: string
  fromAddress: string
  saveToSentItems?: boolean
}

function toRecipients(to: string | string[]): Array<{ emailAddress: { address: string } }> {
  return (Array.isArray(to) ? to : [to]).map((address) => ({ emailAddress: { address } }))
}

export function createGraphMailer(opts: GraphMailerOpts): Mailer {
  return {
    async send(msg: OutboundMessage): Promise<void> {
      const token = await opts.getToken()
      const payload = {
        message: {
          subject: msg.subject,
          body: msg.html
            ? { contentType: 'HTML', content: msg.html }
            : { contentType: 'Text', content: msg.text },
          toRecipients: toRecipients(msg.to),
          from: { emailAddress: { address: msg.from ?? opts.fromAddress } },
          replyTo: msg.replyTo ? [{ emailAddress: { address: msg.replyTo } }] : undefined,
        },
        saveToSentItems: opts.saveToSentItems ?? false,
      }
      const res = await opts.graphFetch(
        token,
        'POST',
        `/users/${opts.mailboxUserId}/sendMail`,
        payload,
      )
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`graph sendMail failed: ${res.status} ${text.slice(0, 200)}`)
      }
    },
  }
}
