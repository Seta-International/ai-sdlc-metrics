import { describe, expect, it } from 'vitest'
import { IdentityModule } from '../identity/identity.module'
import { OnProfileChangeAppliedHandler } from './application/event-handlers/on-profile-change-applied.handler'
import { SyncProfileToMsReversalRegistrar } from './infrastructure/jobs/sync-profile-to-ms-reversal.registrar'
import { PeopleModule } from './people.module'

describe('PeopleModule', () => {
  it('registers reverse-sync handler, registrar, and preserves IdentityModule import', () => {
    const providers =
      (Reflect.getMetadata('providers', PeopleModule) as unknown[] | undefined) ?? []
    const imports = (Reflect.getMetadata('imports', PeopleModule) as unknown[] | undefined) ?? []

    expect(providers).toContain(OnProfileChangeAppliedHandler)
    expect(providers).toContain(SyncProfileToMsReversalRegistrar)
    expect(imports).toContain(IdentityModule)
  })
})
