/**
 * DueBadge — renders a formatted due date badge with status coloring.
 *
 * States (using design-system tokens):
 *   overdue   → danger token (status-text-danger / status-bg-danger)
 *   due today → warning token (status-text-warning / status-bg-warning)
 *   future    → muted (fg-muted)
 */
interface DueBadgeProps {
  dueDate: Date
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function getDueState(dueDate: Date): 'overdue' | 'today' | 'future' {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const due = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate())

  if (due < today) return 'overdue'
  if (due.getTime() === today.getTime()) return 'today'
  return 'future'
}

const STATE_CLASSES = {
  overdue: 'text-status-text-danger bg-status-bg-danger',
  today: 'text-status-text-warning bg-status-bg-warning',
  future: 'text-fg-muted',
} as const

export function DueBadge({ dueDate }: DueBadgeProps) {
  const state = getDueState(dueDate)
  const classes = STATE_CLASSES[state]

  return (
    <span
      className={`inline-flex items-center rounded px-1 py-0.5 text-label font-510 leading-none ${classes}`}
      aria-label={`Due ${formatDate(dueDate)}${state === 'overdue' ? ' (overdue)' : state === 'today' ? ' (today)' : ''}`}
    >
      {formatDate(dueDate)}
    </span>
  )
}
