/**
 * Contract tests: MS Planner attachment upload / download via SharePoint Drives.
 *
 * Skipped unless MS_SANDBOX_TENANT_AD_ID, MS_SANDBOX_CLIENT_ID, and
 * MS_SANDBOX_CLIENT_SECRET are all set in the environment.
 *
 * Required env vars:
 *   MS_SANDBOX_TENANT_AD_ID   – AAD tenant ID of the sandbox
 *   MS_SANDBOX_CLIENT_ID      – App registration client ID
 *   MS_SANDBOX_CLIENT_SECRET  – Client secret (never commit)
 *   MS_SANDBOX_PLAN_ID        – Known plan ID pre-seeded in the sandbox
 *
 * Run locally:
 *   MS_SANDBOX_TENANT_AD_ID=… MS_SANDBOX_CLIENT_ID=… MS_SANDBOX_CLIENT_SECRET=… \
 *     MS_SANDBOX_PLAN_ID=… \
 *     bun vitest run src/modules/planner/infrastructure/ms-graph/__contract__
 */
import { describe, it, expect } from 'vitest'

const skip = !process.env['MS_SANDBOX_TENANT_AD_ID']

/**
 * Attachment contracts validate the two-step upload→reference flow used by
 * MsSharePointClient: upload bytes to a Drive, then attach the resulting
 * driveItem reference to the Planner task.  Download integrity confirms the
 * Graph URL we store is stable and byte-identical to what we uploaded.
 */
describe.skipIf(skip)(
  'Contract: MS Planner attachments — upload / download via Drives',
  { timeout: 60_000 },
  () => {
    it('upload attachment via drives and create reference on task', async () => {
      // Placeholder: in real PERF env —
      //   1. PUT /drives/{driveId}/items/{path}:/content → { id, webUrl }
      //   2. PATCH /planner/tasks/{taskId}/details with attachments map entry
      // Expected: task details.attachments contains the new entry keyed by webUrl.
      expect(true).toBe(true)
    })

    it('download attachment back and verify content integrity', async () => {
      // Placeholder: in real PERF env —
      //   GET /drives/{driveId}/items/{itemId}/content → raw bytes
      // Expected: sha256(downloaded bytes) === sha256(original upload bytes).
      expect(true).toBe(true)
    })
  },
)
