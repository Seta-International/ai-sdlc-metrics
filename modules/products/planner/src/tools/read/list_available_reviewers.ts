import type { Tool } from '@seta/agent-core'
import { logger } from '@seta/observability'
import { tenantContext } from '@seta/tenancy'
import { z } from 'zod'
import type { ReadToolDeps } from './list_my_tasks'

const log = logger.child({ component: 'planner.list_available_reviewers' })

const Input = z.object({
  skills: z
    .array(z.string().min(1))
    .min(1)
    .max(20)
    .describe(
      'Skills inferred from the task description — e.g. ["kubernetes","aws"] for an infra task, ' +
        '["oauth","firewall"] for a security task.',
    ),
  myTeamOnly: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      'When true, restrict results to direct reports of the current user (manager_id = current user). ' +
        'Use this when the manager wants to see which of their own people can review a task.',
    ),
  planId: z
    .string()
    .optional()
    .describe('When provided, restrict results to members of this plan only.'),
})

const ReviewerRow = z.object({
  entra_object_id: z.string(),
  display_name: z.string().nullable(),
  user_principal_name: z.string().nullable(),
  job_title: z.string().nullable(),
  department: z.string().nullable(),
  availability: z.string().nullable(),
  activity: z.string().nullable(),
  matched_skills: z.array(z.string()),
  active_task_count: z.number().int(),
  active_task_titles: z.array(z.string()),
})

const Output = z.object({ reviewers: z.array(ReviewerRow) })

export function listAvailableReviewersTool(
  deps: ReadToolDeps,
): Tool<z.infer<typeof Input>, z.infer<typeof Output>> {
  return {
    id: 'planner.list_available_reviewers',
    description:
      'Returns directory users who are currently Available and whose skill set overlaps ' +
      'with the given skills. Use this after classifying a task as infrastructure or security ' +
      'work to find suitable reviewers. Results are ranked by number of matched skills.',
    inputSchema: Input as never,
    outputSchema: Output as never,
    annotations: { readOnlyHint: true, idempotentHint: true },
    async execute(input, _ctx) {
      try {
        log.debug(
          { tenantId: tenantContext.getTenantIdOrUndefined(), skills: input.skills },
          'planner.list_available_reviewers.start',
        )

        const rows = (await deps.sql`
          SELECT
            u.entra_object_id,
            u.display_name,
            u.user_principal_name,
            u.raw->>'jobTitle'                        AS job_title,
            u.raw->>'department'                       AS department,
            u.raw->'presence'->>'availability'         AS availability,
            u.raw->'presence'->>'activity'             AS activity,
            ARRAY(
              SELECT elem
              FROM   jsonb_array_elements_text(u.raw->'skills') elem
              WHERE  elem = ANY(${input.skills})
            )                                          AS matched_skills,
            (
              SELECT COUNT(*)::int
              FROM   planner.v_visible_tasks t
              WHERE  u.entra_object_id = ANY(t.assignee_ids)
                AND  t.percent_complete BETWEEN 1 AND 99
            )                                          AS active_task_count,
            ARRAY(
              SELECT t.title
              FROM   planner.v_visible_tasks t
              WHERE  u.entra_object_id = ANY(t.assignee_ids)
                AND  t.percent_complete BETWEEN 1 AND 99
              ORDER BY t.priority, t.due_date NULLS LAST
              LIMIT  5
            )                                          AS active_task_titles
          FROM connector_ms365_directory.directory_users u
          WHERE u.tenant_id = current_setting('app.tenant_id')::uuid
            AND u.raw->'presence'->>'availability' = 'Available'
            AND EXISTS (
              SELECT 1
              FROM   jsonb_array_elements_text(u.raw->'skills') s
              WHERE  s = ANY(${input.skills})
            )
            AND (
              NOT ${input.myTeamOnly ?? false}
              OR u.manager_id = current_setting('app.user_id')
            )
            AND (
              ${input.planId ?? null}::text IS NULL
              OR EXISTS (
                SELECT 1
                FROM   connector_ms365_planner.plan_members pm
                WHERE  pm.tenant_id = u.tenant_id
                  AND  pm.plan_id   = ${input.planId ?? null}
                  AND  pm.user_id   = u.entra_object_id
              )
            )
          ORDER BY
            array_length(
              ARRAY(
                SELECT elem
                FROM   jsonb_array_elements_text(u.raw->'skills') elem
                WHERE  elem = ANY(${input.skills})
              ),
              1
            ) DESC NULLS LAST,
            u.display_name
        `) as z.infer<typeof ReviewerRow>[]

        return { ok: true, value: { reviewers: rows } }
      } catch (e) {
        log.error({ err: e }, 'planner.list_available_reviewers.failed')
        return { ok: false, error: { name: (e as Error).name, message: (e as Error).message } }
      }
    },
  }
}
