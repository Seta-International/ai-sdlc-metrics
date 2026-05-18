import { describe, expect, it, vi } from 'vitest'
import { type MailerResolverDeps, mailerForTenant } from './resolver'
import { MailerNotConfigured } from './types'

const tenantId = 't-1'

function deps(over: Partial<MailerResolverDeps> = {}): MailerResolverDeps {
  return {
    nodeEnv: 'development',
    getMailerConfig: async () => null,
    getEntraTenantIdForTenant: async () => 'entra-tid',
    platformConnector: {
      acquireAppOnly: async () => ({ accessToken: 'TOK' }),
    },
    graphFetch: vi.fn(async () => new Response('', { status: 202 })) as never,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as never,
    ...over,
  }
}

describe('mailerForTenant', () => {
  it('returns console mailer when no config row exists in development', async () => {
    const m = await mailerForTenant(tenantId, deps())
    expect(m).toBeTruthy()
  })

  it('throws MailerNotConfigured when no row exists in production', async () => {
    await expect(mailerForTenant(tenantId, deps({ nodeEnv: 'production' }))).rejects.toBeInstanceOf(
      MailerNotConfigured,
    )
  })

  it('returns a graph mailer when row provider=graph', async () => {
    const m = await mailerForTenant(
      tenantId,
      deps({
        getMailerConfig: async () => ({
          provider: 'graph',
          config: { mailbox_user_id: 'mbox', from_address: 'from@x.test' },
        }),
      }),
    )
    expect(m).toBeTruthy()
  })

  it('throws when graph backend requested but entra tenant id is missing', async () => {
    await expect(
      mailerForTenant(
        tenantId,
        deps({
          getMailerConfig: async () => ({
            provider: 'graph',
            config: { mailbox_user_id: 'mbox', from_address: 'from@x.test' },
          }),
          getEntraTenantIdForTenant: async () => null,
        }),
      ),
    ).rejects.toThrow(/entra tenant id/i)
  })
})
