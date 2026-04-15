import { describe, expect, it } from 'vitest'
import { ImportLinkedInProfileCommand } from './import-linkedin-profile.command'
import { ImportLinkedInProfileHandler } from './import-linkedin-profile.handler'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const EMPLOYMENT_ID = '01900000-0000-7000-8000-000000000002'

describe('ImportLinkedInProfileHandler', () => {
  it('throws because LinkedIn profile import is not yet implemented', async () => {
    const handler = new ImportLinkedInProfileHandler()

    await expect(
      handler.execute(
        new ImportLinkedInProfileCommand(
          TENANT_ID,
          EMPLOYMENT_ID,
          'auth-code-123',
          'https://app.example.com/callback',
        ),
      ),
    ).rejects.toThrow('LinkedIn profile import not yet implemented')
  })
})
