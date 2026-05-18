import { describe, expect, it, vi } from 'vitest'
import { createConsoleMailer } from '../../src/console'
import { createGraphMailer } from '../../src/graph'
import type { Mailer } from '../../src/types'

type Backend = { name: string; make(): Mailer }

const consoleLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }

const graphFetchOk = vi.fn(async () => new Response('', { status: 202 }))
const graphFetchErr = vi.fn(async () => new Response('boom', { status: 500 }))

const backends: Backend[] = [
  { name: 'console', make: () => createConsoleMailer({ logger: consoleLogger as never }) },
  {
    name: 'graph',
    make: () =>
      createGraphMailer({
        getToken: async () => 'TOK',
        graphFetch: graphFetchOk as never,
        mailboxUserId: 'noreply@acme.com',
        fromAddress: 'noreply@acme.com',
      }),
  },
]

for (const b of backends) {
  describe(`Mailer contract — ${b.name}`, () => {
    it('accepts a minimal OutboundMessage and does not throw', async () => {
      const m = b.make()
      await expect(m.send({ to: 'a@b.com', subject: 's', text: 'b' })).resolves.toBeUndefined()
    })

    it('accepts an array of recipients', async () => {
      const m = b.make()
      await expect(
        m.send({ to: ['a@b.com', 'c@d.com'], subject: 's', text: 'b' }),
      ).resolves.toBeUndefined()
    })

    it('accepts an HTML body', async () => {
      const m = b.make()
      await expect(
        m.send({ to: 'a@b.com', subject: 's', text: 'b', html: '<p>hi</p>' }),
      ).resolves.toBeUndefined()
    })
  })
}

describe('Mailer contract — graph error handling', () => {
  it('graph backend throws on 5xx', async () => {
    const m = createGraphMailer({
      getToken: async () => 'TOK',
      graphFetch: graphFetchErr as never,
      mailboxUserId: 'mbox',
      fromAddress: 'from@x.test',
    })
    await expect(m.send({ to: 'a@b.c', subject: 's', text: 'b' })).rejects.toThrow(/500/)
  })
})
