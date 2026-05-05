export const taskKeys = {
  board: (planId: string, actorId: string, tenantId: string) =>
    ['tasks.getBoard', planId, actorId, tenantId] as const,
  flat: (planId: string, actorId: string, tenantId: string) =>
    ['tasks.getFlat', planId, actorId, tenantId] as const,
  detail: (taskId: string, actorId: string, tenantId: string) =>
    ['tasks.getDetail', taskId, actorId, tenantId] as const,
  detailBase: (taskId: string) => ['tasks.getDetail', taskId] as const,
  trends: (planId: string, actorId: string, tenantId: string, range: string) =>
    ['tasks.getTrends', planId, actorId, tenantId, range] as const,
}

export const planKeys = {
  get: (
    planId: string | null | undefined,
    actorId: string | null | undefined,
    tenantId: string | null | undefined,
  ) => ['plans.get', planId, actorId, tenantId] as const,
  list: (actorId: string | null | undefined, tenantId: string | null | undefined) =>
    ['plans.list', actorId, tenantId] as const,
}

export const personalKeys = {
  listPlans: (actorId: string | null | undefined, tenantId: string | null | undefined) =>
    ['planner.personal.listPlans', actorId, tenantId] as const,
  listTasks: (actorId: string, tenantId: string, includeCompleted: boolean) =>
    ['personal.listTasks', actorId, tenantId, includeCompleted] as const,
  myDay: (actorId: string, tenantId: string, date: string) =>
    ['personal.myDay', actorId, tenantId, date] as const,
  myDayCarryOver: (actorId: string, tenantId: string, date: string) =>
    ['personal.myDay.carryOverCandidates', actorId, tenantId, date] as const,
  charts: (actorId: string | null | undefined, tenantId: string | null | undefined) =>
    ['planner.personal.getCharts', actorId, tenantId] as const,
}

export const plannerKeys = {
  viewFlags: (tenantId: string | null | undefined) =>
    ['planner.plans.getViewFlags', tenantId] as const,
}

export const msSyncKeys = {
  flags: (tenantId: string | null | undefined) => ['msSync.flags', tenantId] as const,
  groupsLinked: (tenantId: string | null | undefined) =>
    ['msSync.groups.listLinked', tenantId] as const,
  rostersLinked: (tenantId: string | null | undefined) =>
    ['msSync.rosters.listLinked', tenantId] as const,
}

export const adminKeys = {
  tenantTimezone: (tenantId: string | null | undefined) =>
    ['admin.getTenantTimezone', tenantId] as const,
}
