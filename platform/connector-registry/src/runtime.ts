import { DomainError } from '@seta/middleware'
import { tenantContext } from '@seta/tenancy'
import type { ConnectorDefinition, ConnectorRegistry } from './types'

export class ConnectorNotConsented extends DomainError {
  constructor(tenantId: string, connectorId: string) {
    super(403, 'connector not consented', {
      detail: `tenant ${tenantId} has not consented to connector ${connectorId}`,
    })
  }
}

export class ConnectorUnknown extends DomainError {
  constructor(connectorId: string) {
    super(400, 'unknown connector', { detail: `no connector registered with id '${connectorId}'` })
  }
}

export type RequireConsentFn = (tenantId: string, connectorId: string) => Promise<boolean>

/**
 * Create a registry instance. `consentCheck` is injected so the package can stay
 * vendor-neutral; the composition root wires a fn that queries tenant_connectors.
 */
export function createConnectorRegistry(consentCheck?: RequireConsentFn): ConnectorRegistry {
  const byId = new Map<string, ConnectorDefinition>()

  return {
    register(def) {
      if (byId.has(def.id)) throw new Error(`connector '${def.id}' already registered`)
      byId.set(def.id, def)
    },
    get(id) {
      const def = byId.get(id)
      if (!def) throw new ConnectorUnknown(id)
      return def
    },
    list() {
      return [...byId.values()]
    },
    listByProvider(providerId) {
      return [...byId.values()].filter((d) => d.providerId === providerId)
    },
    scopeUnion(ids) {
      const delegated = new Set<string>()
      const application = new Set<string>()
      for (const id of ids) {
        const d = this.get(id)
        for (const s of d.requiredScopes.delegated) delegated.add(s)
        for (const s of d.requiredScopes.application) application.add(s)
      }
      return { delegated: [...delegated], application: [...application] }
    },
    async requireConsent(connectorId) {
      if (!consentCheck) throw new Error('consentCheck not configured')
      const tenantId = tenantContext.getTenantId()
      const ok = await consentCheck(tenantId, connectorId)
      if (!ok) throw new ConnectorNotConsented(tenantId, connectorId)
    },
  }
}
