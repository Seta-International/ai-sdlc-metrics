/**
 * AssigneeAvatarStack — shows up to 3 initials avatars with +N overflow indicator.
 * Uses design-system tokens only (no hardcoded hex colors).
 */
interface Assignee {
  actorId: string
  name?: string
  avatarUrl?: string
}

interface AssigneeAvatarStackProps {
  assignees: Assignee[]
  /** Max number of avatars to show before overflow. Defaults to 3. */
  maxVisible?: number
}

/** Deterministic color index from a string (actorId) */
function colorIndex(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0
  }
  return hash % AVATAR_COLORS.length
}

/**
 * Avatar background colors — using design-system tokens via inline CSS variables.
 * All defined as Tailwind bg-* classes pointing to CSS custom properties.
 */
const AVATAR_COLORS = ['bg-brand', 'bg-emerald', 'bg-security', 'bg-success-ds'] as const

function getInitials(name?: string): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return (parts[0]?.[0] ?? '?').toUpperCase()
  return ((parts[0]?.[0] ?? '') + (parts[parts.length - 1]?.[0] ?? '')).toUpperCase()
}

export function AssigneeAvatarStack({ assignees, maxVisible = 3 }: AssigneeAvatarStackProps) {
  const visible = assignees.slice(0, maxVisible)
  const overflow = assignees.length - visible.length

  if (assignees.length === 0) return null

  return (
    <div
      className="flex items-center -space-x-1.5"
      aria-label={`${assignees.length} assignee${assignees.length > 1 ? 's' : ''}`}
    >
      {visible.map((assignee) => (
        <div
          key={assignee.actorId}
          className={`relative flex size-5 items-center justify-center rounded-full ring-1 ring-panel text-tiny font-510 text-fg-primary flex-shrink-0 ${AVATAR_COLORS[colorIndex(assignee.actorId)]}`}
          title={assignee.name ?? assignee.actorId}
        >
          {assignee.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={assignee.avatarUrl}
              alt={assignee.name ?? assignee.actorId}
              className="size-full rounded-full object-cover"
            />
          ) : (
            getInitials(assignee.name)
          )}
        </div>
      ))}
      {overflow > 0 && (
        <div
          className="flex size-5 items-center justify-center rounded-full bg-elevated ring-1 ring-panel text-tiny font-510 text-fg-secondary flex-shrink-0"
          aria-label={`${overflow} more`}
        >
          +{overflow}
        </div>
      )}
    </div>
  )
}
