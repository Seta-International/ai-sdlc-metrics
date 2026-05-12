import type { ConnectorDefinition } from '@seta/connector-registry'

export const plannerConnector: ConnectorDefinition = {
  id: 'ms365-planner',
  providerId: 'entra',
  displayName: 'Microsoft 365 Planner',
  description: 'Read and write tasks, plans, and buckets in Microsoft Planner.',
  customerFacingRationale:
    "Lets the agent list, create, update, and complete Planner tasks; create new plans on the user's behalf for new workstreams.",
  requiredScopes: {
    delegated: ['Tasks.ReadWrite', 'Group.ReadWrite.All', 'Group.Read.All'],
    application: ['Tasks.Read.All', 'Group.Read.All'],
  },
  capabilities: { syncable: true, writes: true },
}
