import type { Logger } from '@seta/observability'
import { createConsoleMailer } from './console'
import { createGraphMailer, type GraphFetch } from './graph'
import { type Mailer, MailerNotConfigured } from './types'

export type MailerConfigInput = {
  provider: 'graph'
  config: { mailbox_user_id: string; from_address: string }
}

export interface MailerResolverDeps {
  nodeEnv: 'development' | 'test' | 'production'
  getMailerConfig: (tenantId: string) => Promise<MailerConfigInput | null>
  getEntraTenantIdForTenant: (tenantId: string) => Promise<string | null>
  platformConnector: {
    acquireAppOnly: (entraTenantId: string, scopes: string[]) => Promise<{ accessToken: string }>
  }
  graphFetch: GraphFetch
  logger: Logger
  defaultFrom?: string
}

export async function mailerForTenant(tenantId: string, deps: MailerResolverDeps): Promise<Mailer> {
  const row = await deps.getMailerConfig(tenantId)
  if (!row) {
    if (deps.nodeEnv === 'production') throw new MailerNotConfigured(tenantId)
    return createConsoleMailer(
      deps.defaultFrom !== undefined
        ? { logger: deps.logger, defaultFrom: deps.defaultFrom }
        : { logger: deps.logger },
    )
  }
  switch (row.provider) {
    case 'graph': {
      const entraTenantId = await deps.getEntraTenantIdForTenant(tenantId)
      if (!entraTenantId) {
        throw new Error('graph mailer requires an entra tenant id from sso_configs')
      }
      return createGraphMailer({
        getToken: () =>
          deps.platformConnector
            .acquireAppOnly(entraTenantId, ['https://graph.microsoft.com/.default'])
            .then((b) => b.accessToken),
        graphFetch: deps.graphFetch,
        mailboxUserId: row.config.mailbox_user_id,
        fromAddress: row.config.from_address,
      })
    }
    default: {
      const x: never = row.provider
      throw new Error(`Unreachable: mailer provider '${x as string}'`)
    }
  }
}
