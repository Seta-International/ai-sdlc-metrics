import { describe, expect, it } from 'vitest'
import { ConfirmLinkedInImportCommand } from './confirm-linkedin-import.command'
import { ConfirmLinkedInImportHandler } from './confirm-linkedin-import.handler'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const EMPLOYMENT_ID = '01900000-0000-7000-8000-000000000002'

describe('ConfirmLinkedInImportHandler', () => {
  it('throws because LinkedIn import confirmation is not yet implemented', async () => {
    const handler = new ConfirmLinkedInImportHandler()

    await expect(
      handler.execute(new ConfirmLinkedInImportCommand(TENANT_ID, EMPLOYMENT_ID, [], 'actor-1')),
    ).rejects.toThrow('LinkedIn import confirmation not yet implemented')
  })
})
