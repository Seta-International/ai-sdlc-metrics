import type { ConnectorDefinition } from '@seta/connector-registry'

export const directoryConnector: ConnectorDefinition = {
  id: 'ms365-directory',
  providerId: 'entra',
  displayName: 'Microsoft 365 Directory',
  description: 'Sync users, groups, and group memberships from your Microsoft 365 directory.',
  customerFacingRationale:
    "Lets the agent know who exists in your organization, who reports to whom, and who's in which group — used for workload analysis and assignment recommendations.",
  requiredScopes: {
    delegated: ['User.Read'],
    application: ['User.Read.All', 'Group.Read.All'],
  },
  capabilities: { syncable: true, writes: false },
}
