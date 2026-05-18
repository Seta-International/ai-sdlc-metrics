export type { AuditWriter, SsoAuditEvent } from './admin-audit'
export { recordSsoAudit } from './admin-audit'
export type { SsoAdminRoutesDeps } from './admin-routes'
export { createSsoAdminRoutes } from './admin-routes'
export { signCookie, verifyCookie } from './cookie'
export { deriveCsrfToken } from './csrf'
export {
  LAST_LOGIN_COOKIE_NAME,
  LastLoginHint,
  readLastLoginHint,
  signLastLoginHint,
} from './last-login'
export type { MagicLinkRoutesDeps } from './magic-link-routes'
export { createMagicLinkRoutes } from './magic-link-routes'
export {
  deleteMailerConfig,
  getMailerConfigByTenant,
  upsertMailerConfig,
} from './mailer-config-repo'
export type { GraphMailerConfig, MailerConfigDiscriminated } from './mailer-config-schema'
export {
  MailerConfigDiscriminated as MailerConfigSchema,
  parseMailerConfig,
} from './mailer-config-schema'
export type { ResolveNextUrlInput } from './me/resolve-next-url'
export { resolveNextUrl } from './me/resolve-next-url'
export type { AttachStatus, MeContext, MeContextProvider } from './me-context-provider'
export type { CsrfOpts, RequireSessionOpts, SessionStore, SsoVariables } from './middleware'
export { csrfMiddleware, requireSession } from './middleware'
export type { RequireSuperadminOpts } from './middleware/require-superadmin'
export { requireSuperadmin } from './middleware/require-superadmin'
export { generatePkce } from './pkce'
export type { OidcIdToken, SsoProvider } from './provider'
export type { EntraSsoConfig } from './providers/entra'
export { EntraSsoProvider } from './providers/entra'
export { ssoProviderFor } from './providers/entra-factory'
export type { SsoRoutesDeps } from './routes'
export { createSsoRoutes } from './routes'
export type {
  MagicLinkRow,
  MailerConfigRow,
  NewMagicLinkRow,
  NewMailerConfigRow,
  NewSession,
  NewSsoConfigRow,
  NewSsoEmailDomainRow,
  NewUser,
  NewUserIdentity,
  Session,
  SsoConfigRow,
  SsoEmailDomainRow,
  User,
  UserIdentity,
} from './schema'
export {
  authSchema,
  magicLinks,
  mailerConfigs,
  sessions,
  ssoConfigs,
  ssoEmailDomains,
  userIdentities,
  users,
} from './schema'
export {
  DiscoverBody,
  DiscoverResponse,
  MeResponse,
  ProviderParam,
  SessionUser,
  StartBody,
  StartResponse,
  TenantSummary,
} from './schemas'
export {
  MailerDetail,
  MailerUpsertBody,
  SsoConfigDetail,
  SsoListItem,
  SsoListResponse,
  SsoRotateSecretBody,
  SsoTestResponse,
  SsoUpsertBody,
} from './schemas-admin'
export type { PostgresSessionStore } from './session-store'
export { createSessionStore } from './session-store'
export {
  getSsoConfigByTenant,
  resolveSsoByEmail,
  upsertSsoConfig,
  upsertSsoEmailDomain,
} from './sso-config-repo'
export type { EntraConfig, SsoConfigDiscriminated } from './sso-config-schema'
export {
  parseSsoConfig,
  SsoConfigDiscriminated as SsoConfigSchema,
} from './sso-config-schema'
export {
  isDeniedSsoEmailDomain,
  normalizeEmailDomain,
  SSO_EMAIL_DOMAIN_DENYLIST,
} from './sso-domain-denylist'
export { isSuperadmin } from './superadmin-repo'
export { upsertUserByIdentity } from './users-repo'
