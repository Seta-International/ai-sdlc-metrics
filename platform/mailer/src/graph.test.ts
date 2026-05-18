import { describe, expect, it, vi } from 'vitest'
import { createGraphMailer } from './graph'

describe('createGraphMailer', () => {
  it('POSTs to /users/{mailbox}/sendMail with token from getToken', async () => {
    const getToken = vi.fn().mockResolvedValue('TOK')
    const calls: Array<{ token: string; method: string; url: string; body: string }> = []
    const graphFetchFake = vi.fn(
      async (token: string, method: string, url: string, body?: unknown) => {
        calls.push({ token, method, url, body: JSON.stringify(body) })
        return new Response('', { status: 202 })
      },
    )
    const m = createGraphMailer({
      getToken,
      graphFetch: graphFetchFake as never,
      mailboxUserId: 'noreply@acme.com',
      fromAddress: 'noreply@acme.com',
    })
    await m.send({ to: ['alice@acme.com'], subject: 'Hi', text: 'body' })
    expect(getToken).toHaveBeenCalled()
    expect(graphFetchFake).toHaveBeenCalledTimes(1)
    const captured = calls[0]
    expect(captured?.url).toBe('/users/noreply@acme.com/sendMail')
    expect(captured?.token).toBe('TOK')
    expect(captured?.method).toBe('POST')
    const parsed = JSON.parse(captured!.body) as {
      message: {
        subject: string
        toRecipients: Array<{ emailAddress: { address: string } }>
      }
    }
    expect(parsed.message.subject).toBe('Hi')
    expect(parsed.message.toRecipients[0]?.emailAddress.address).toBe('alice@acme.com')
  })

  it('throws on a non-2xx response', async () => {
    const graphFetchFake = vi.fn(async () => new Response('oops', { status: 500 }))
    const m = createGraphMailer({
      getToken: async () => 'TOK',
      graphFetch: graphFetchFake as never,
      mailboxUserId: 'noreply@acme.com',
      fromAddress: 'noreply@acme.com',
    })
    await expect(m.send({ to: 'a@b.com', subject: 's', text: 'b' })).rejects.toThrow(/500/)
  })
})
