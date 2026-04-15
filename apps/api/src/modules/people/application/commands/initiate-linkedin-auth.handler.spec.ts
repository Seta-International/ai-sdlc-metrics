import { describe, expect, it } from 'vitest'
import { InitiateLinkedInAuthCommand } from './initiate-linkedin-auth.command'
import { InitiateLinkedInAuthHandler } from './initiate-linkedin-auth.handler'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const EMPLOYMENT_ID = '01900000-0000-7000-8000-000000000002'

describe('InitiateLinkedInAuthHandler', () => {
  it('throws because LinkedIn OAuth integration is not yet implemented', async () => {
    const handler = new InitiateLinkedInAuthHandler()

    await expect(
      handler.execute(
        new InitiateLinkedInAuthCommand(
          TENANT_ID,
          EMPLOYMENT_ID,
          'https://app.example.com/callback',
        ),
      ),
    ).rejects.toThrow('LinkedIn OAuth integration not yet implemented')
  })
})
