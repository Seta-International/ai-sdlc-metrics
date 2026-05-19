import type { Tool } from '@seta/agent-core'
import { logger } from '@seta/observability'
import { tenantContext } from '@seta/tenancy'
import { z } from 'zod'
import type { ReadToolDeps } from './list_my_tasks'

const log = logger.child({ component: 'planner.list_direct_reports' })

const Input = z.object({})

const DirectReportRow = z.object({
  entra_object_id: z.string(),
  display_name: z.string().nullable(),
  user_principal_name: z.string().nullable(),
  job_title: z.string().nullable(),
  department: z.string().nullable(),
  availability: z.string().nullable(),
  activity: z.string().nullable(),
})

const Output = z.object({ reports: z.array(DirectReportRow) })

export function listDirectReportsTool(
  deps: ReadToolDeps,
): Tool<z.infer<typeof Input>, z.infer<typeof Output>> {
  return {
    id: 'planner.list_direct_reports',
    description:
      'Returns all directory users whose manager is the current user. ' +
      'Use this when the manager asks "who is on my team", "who do I manage", or needs ' +
      'to pick a person for get_one_on_one_prep.',
    inputSchema: Input as never,
    outputSchema: Output as never,
    annotations: { readOnlyHint: true, idempotentHint: true },
    async execute(_input, _ctx) {
      try {
        log.debug(
          { tenantId: tenantContext.getTenantIdOrUndefined() },
          'planner.list_direct_reports.start',
        )

        const rows = (await deps.sql`
          SELECT
            u.entra_object_id,
            u.display_name,
            u.user_principal_name,
            u.raw->>'jobTitle'                 AS job_title,
            u.raw->>'department'               AS department,
            u.raw->'presence'->>'availability' AS availability,
            u.raw->'presence'->>'activity'     AS activity
          FROM connector_ms365_directory.directory_users u
          WHERE u.tenant_id  = current_setting('app.tenant_id')::uuid
            AND u.manager_id = current_setting('app.user_id')
          ORDER BY u.display_name
        `) as z.infer<typeof DirectReportRow>[]

        return { ok: true, value: { reports: rows } }
      } catch (e) {
        log.error({ err: e }, 'planner.list_direct_reports.failed')
        return { ok: false, error: { name: (e as Error).name, message: (e as Error).message } }
      }
    },
  }
}
