import type { SsoProvider } from '../provider'
import type { SsoConfigDiscriminated } from '../sso-config-schema'
import { EntraSsoProvider } from './entra'

export function ssoProviderFor(row: SsoConfigDiscriminated, clientSecret: string): SsoProvider {
  switch (row.provider) {
    case 'entra':
      return new EntraSsoProvider({
        clientId: row.config.client_id,
        clientSecret,
        entraTenantId: row.config.entra_tenant_id,
      })
    default: {
      const x: never = row.provider
      throw new Error(`Unreachable: unknown provider '${x as string}'`)
    }
  }
}
