import { normalizeSkillsCsv } from './aliases.js'
import type { Dataset } from './types.js'

const TODAY = '2026-05-20'

export type Suggestion = { user_id: string; matches: number }

export function suggestForTask(
  ds: Dataset,
  taskId: string,
  requiredSkills: readonly string[],
  options: { normalizeAliases?: boolean } = {},
): Suggestion[] {
  const task = ds.tasks.find((t) => t.task_id === taskId)
  if (!task) throw new Error(`task ${taskId} not found`)

  const memberIds = ds.plan_members
    .filter((m) => m.plan_id === task.plan_id)
    .map((m) => m.member_id)
  const excluded = new Set(task.assignee_ids === '' ? [] : task.assignee_ids.split(','))
  const viewerIds = new Set(
    ds.users.filter((u) => u.rbac_role === 'planner.viewer').map((u) => u.user_id),
  )
  const candidates = memberIds.filter((id) => !excluded.has(id) && !viewerIds.has(id))

  const required = new Set(requiredSkills)
  const upper = task.due_date === '' || task.due_date < TODAY ? TODAY : task.due_date

  const scored = candidates
    .map((id): Suggestion | null => {
      const user = ds.users.find((u) => u.user_id === id)
      if (!user || user.skills === '') return null
      const userSkills = options.normalizeAliases
        ? normalizeSkillsCsv(user.skills).split(',')
        : user.skills.split(',')
      const matches = userSkills.filter((s) => required.has(s)).length
      if (matches === 0) return null
      const blocked = ds.timesheet.some(
        (l) =>
          l.employee_id === id &&
          l.status === 'approved' &&
          l.start_date <= upper &&
          l.end_date >= TODAY,
      )
      if (blocked) return null
      return { user_id: id, matches }
    })
    .filter((s): s is Suggestion => s !== null)

  scored.sort((a, b) => b.matches - a.matches || a.user_id.localeCompare(b.user_id))
  return scored
}
