import { Logger } from '@nestjs/common'
import { describe, expect, it } from 'vitest'
import type { IdentityProviderEntity } from '../../domain/entities/identity-provider.entity'
import { GoogleDirectoryProvider } from './google-directory.provider'

describe('GoogleDirectoryProvider', () => {
  Logger.overrideLogger(false)
  const provider = new GoogleDirectoryProvider({} as IdentityProviderEntity)

  it('returns stubbed connection success until Google implementation is provided', async () => {
    await expect(provider.testConnection()).resolves.toEqual({ ok: true })
  })

  it('returns empty users and groups until Google implementation is provided', async () => {
    await expect(provider.listUsers()).resolves.toEqual([])
    await expect(provider.listGroupsWithMembers()).resolves.toEqual([])
  })
})
