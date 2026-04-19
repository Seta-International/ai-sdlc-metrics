export const VIEW_KEYS = ['board', 'grid', 'schedule', 'charts'] as const
export const GROUP_KEYS = ['bucket', 'progress', 'due', 'priority', 'assignee', 'label'] as const
export const PRIORITIES = ['urgent', 'important', 'medium', 'low'] as const
export const DUE_BUCKETS = [
  'late',
  'today',
  'tomorrow',
  'this-week',
  'next-week',
  'future',
  'none',
] as const
export const SORT_FIELDS = [
  'title',
  'bucket',
  'progress',
  'priority',
  'start',
  'due',
  'updated',
] as const

export type ViewKey = (typeof VIEW_KEYS)[number]
export type GroupKey = (typeof GROUP_KEYS)[number]
export type Priority = (typeof PRIORITIES)[number]
export type DueBucket = (typeof DUE_BUCKETS)[number]
export type SortField = (typeof SORT_FIELDS)[number]

export type ViewState = {
  view: ViewKey
  groupBy: GroupKey
  sort?: { field: SortField; dir: 'asc' | 'desc' }
  filter: {
    due?: DueBucket
    priority: Priority[]
    labels: string[]
    buckets: string[]
    assignees: string[]
  }
  scale?: 'week' | 'month'
  trendRange?: '7d' | '30d' | '90d'
}

export const DEFAULT_VIEW_STATE: ViewState = {
  view: 'board',
  groupBy: 'bucket',
  sort: undefined,
  filter: { due: undefined, priority: [], labels: [], buckets: [], assignees: [] },
  scale: undefined,
  trendRange: undefined,
}

const SORT_RE = /^([a-z]+):(asc|desc)$/

export function parseViewStateFromSearch(params: URLSearchParams): ViewState {
  const view = params.get('view')
  const group = params.get('group')
  const sortRaw = params.get('sort')
  const dueRaw = params.get('filter.due')
  const priorityRaw = params.get('filter.priority')
  const labelsRaw = params.get('filter.labels')
  const bucketsRaw = params.get('filter.buckets')
  const assigneesRaw = params.get('filter.assignees')
  const scaleRaw = params.get('scale')
  const trendRaw = params.get('trendRange')

  const sortMatch = sortRaw?.match(SORT_RE)
  const sortField =
    sortMatch && (SORT_FIELDS as readonly string[]).includes(sortMatch[1])
      ? (sortMatch[1] as SortField)
      : undefined

  const multi = <T extends string>(raw: string | null, allowed: readonly T[]): T[] =>
    raw
      ? raw
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s.length > 0)
          .filter((s): s is T => (allowed as readonly string[]).includes(s))
      : []

  const ids = (raw: string | null): string[] =>
    raw
      ? raw
          .split(',')
          .map((s) => s.trim())
          .filter((s) => /^[a-zA-Z0-9_-]+$/.test(s))
      : []

  // filter.due is a single-valued field — reject if it contains a comma
  const dueValue =
    dueRaw && !dueRaw.includes(',') && (DUE_BUCKETS as readonly string[]).includes(dueRaw)
      ? (dueRaw as DueBucket)
      : undefined

  return {
    view: (VIEW_KEYS as readonly string[]).includes(view ?? '') ? (view as ViewKey) : 'board',
    groupBy:
      (GROUP_KEYS as readonly string[]).includes(group ?? '') && group !== 'plan'
        ? (group as GroupKey)
        : 'bucket',
    sort: sortField ? { field: sortField, dir: sortMatch![2] as 'asc' | 'desc' } : undefined,
    filter: {
      due: dueValue,
      priority: multi(priorityRaw, PRIORITIES),
      labels: ids(labelsRaw),
      buckets: ids(bucketsRaw),
      assignees: ids(assigneesRaw),
    },
    scale: scaleRaw === 'week' || scaleRaw === 'month' ? scaleRaw : undefined,
    trendRange:
      trendRaw === '7d' || trendRaw === '30d' || trendRaw === '90d' ? trendRaw : undefined,
  }
}

export function serializeViewStateToSearch(state: ViewState): string {
  const p = new URLSearchParams()
  if (state.view !== DEFAULT_VIEW_STATE.view) p.set('view', state.view)
  if (state.groupBy !== DEFAULT_VIEW_STATE.groupBy) p.set('group', state.groupBy)
  if (state.sort) p.set('sort', `${state.sort.field}:${state.sort.dir}`)
  if (state.filter.due) p.set('filter.due', state.filter.due)
  if (state.filter.priority.length > 0) p.set('filter.priority', state.filter.priority.join(','))
  if (state.filter.labels.length > 0) p.set('filter.labels', state.filter.labels.join(','))
  if (state.filter.buckets.length > 0) p.set('filter.buckets', state.filter.buckets.join(','))
  if (state.filter.assignees.length > 0) p.set('filter.assignees', state.filter.assignees.join(','))
  if (state.scale) p.set('scale', state.scale)
  if (state.trendRange) p.set('trendRange', state.trendRange)
  // Decode : and , since they're safe unencoded in query strings and improve readability
  return p.toString().replaceAll('%3A', ':').replaceAll('%2C', ',')
}
