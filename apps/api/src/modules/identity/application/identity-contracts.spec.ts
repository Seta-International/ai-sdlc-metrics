import { describe, expect, it } from 'vitest'
import {
  ApiKeyExpiredException,
  ApiKeyNotFoundException,
  ApiKeyRevokedException,
  DirectorySyncAlreadyRunningException,
  IdentityProviderNotFoundException,
  InvalidClientSecretRefException,
  MagicLinkTokenAlreadyUsedException,
  MagicLinkTokenExpiredException,
  MagicLinkTokenNotFoundException,
  PrimaryProviderAlreadyExistsException,
} from '../domain/exceptions/identity.exceptions'
import { RunDirectorySyncCommand } from './commands/run-directory-sync.command'
import { SyncIdpGroupsCommand } from './commands/sync-idp-groups.command'
import { TestIdpConnectionCommand } from './commands/test-idp-connection.command'
import { GetGraphCredentialQuery } from './queries/get-graph-credential.query'
import { GetIdentityProviderQuery } from './queries/get-identity-provider.query'
import { GetIdpGroupMappingsQuery } from './queries/get-idp-group-mappings.query'
import { GetSyncHistoryQuery } from './queries/get-sync-history.query'
import { GetSyncStatusQuery } from './queries/get-sync-status.query'
import { ListApiKeysQuery } from './queries/list-api-keys.query'
import { ListGroupMappingsQuery } from './queries/list-group-mappings.query'
import { ListGroupMembersQuery } from './queries/list-group-members.query'
import { ListLocalUsersQuery } from './queries/list-local-users.query'
import { ValidateApiKeyQuery } from './queries/validate-api-key.query'

describe('identity application contracts', () => {
  it('stores command and query constructor arguments', () => {
    expect(new TestIdpConnectionCommand('tenant', 'provider', 'actor')).toMatchObject({
      tenantId: 'tenant',
      providerId: 'provider',
      testedBy: 'actor',
    })
    expect(new SyncIdpGroupsCommand('tenant', 'actor')).toMatchObject({
      tenantId: 'tenant',
      syncedBy: 'actor',
    })
    expect(new RunDirectorySyncCommand('tenant', 'provider')).toMatchObject({
      tenantId: 'tenant',
      identityProviderId: 'provider',
    })
    expect(new GetGraphCredentialQuery('tenant')).toMatchObject({ tenantId: 'tenant' })
    expect(new GetIdentityProviderQuery('tenant')).toMatchObject({ tenantId: 'tenant' })
    expect(new GetIdpGroupMappingsQuery('tenant')).toMatchObject({ tenantId: 'tenant' })
    expect(new GetSyncHistoryQuery('tenant', 10, 20)).toMatchObject({
      tenantId: 'tenant',
      limit: 10,
      offset: 20,
    })
    expect(new GetSyncStatusQuery('tenant')).toMatchObject({ tenantId: 'tenant' })
    expect(new ListApiKeysQuery('tenant')).toMatchObject({ tenantId: 'tenant' })
    expect(new ListGroupMappingsQuery('tenant')).toMatchObject({ tenantId: 'tenant' })
    expect(new ListGroupMembersQuery('group', 'tenant')).toMatchObject({
      externalGroupId: 'group',
      tenantId: 'tenant',
    })
    expect(new ListLocalUsersQuery('tenant')).toMatchObject({ tenantId: 'tenant' })
    expect(new ValidateApiKeyQuery('hash', 'tenant')).toMatchObject({
      keyHash: 'hash',
      tenantId: 'tenant',
    })
  })

  it('exposes stable domain exception codes', () => {
    expect(new IdentityProviderNotFoundException('p').code).toBe('IDENTITY_PROVIDER_NOT_FOUND')
    expect(new PrimaryProviderAlreadyExistsException('t').code).toBe(
      'PRIMARY_PROVIDER_ALREADY_EXISTS',
    )
    expect(new InvalidClientSecretRefException('bad').code).toBe('INVALID_CLIENT_SECRET_REF')
    expect(new MagicLinkTokenExpiredException().code).toBe('MAGIC_LINK_TOKEN_EXPIRED')
    expect(new MagicLinkTokenAlreadyUsedException().code).toBe('MAGIC_LINK_TOKEN_ALREADY_USED')
    expect(new MagicLinkTokenNotFoundException().code).toBe('MAGIC_LINK_TOKEN_NOT_FOUND')
    expect(new ApiKeyNotFoundException().code).toBe('API_KEY_NOT_FOUND')
    expect(new ApiKeyRevokedException().code).toBe('API_KEY_REVOKED')
    expect(new ApiKeyExpiredException().code).toBe('API_KEY_EXPIRED')
    expect(new DirectorySyncAlreadyRunningException('p').code).toBe(
      'DIRECTORY_SYNC_ALREADY_RUNNING',
    )
  })
})
