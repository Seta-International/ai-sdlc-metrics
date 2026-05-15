export type { TenantContextStore } from './context'
export { tenantContext } from './context'
export type { RequireTenantMembershipOpts, TenantMembership } from './membership'
export { requireTenantMembership } from './membership'
export { tenantMiddleware } from './middleware'
export type { RequireTenantAdminOpts } from './middleware/require-tenant-admin'
export { requireTenantAdmin } from './middleware/require-tenant-admin'
export type { CreateTenantRoutesOpts } from './routes'
export { createTenantRoutes, TenantSummary } from './routes'
export * from './schema'
export type { AttachStatus, Member, TenantMembershipRole, TenantMembershipRow } from './service'
export {
  findOrAttachUser,
  getActiveTenantIds,
  isConnectorConsented,
  listMembers,
  listTenantsForUser,
  recordConsent,
  removeMember,
  setMemberRole,
} from './service'
