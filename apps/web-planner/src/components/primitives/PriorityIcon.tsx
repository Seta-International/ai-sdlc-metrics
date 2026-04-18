/**
 * PriorityIcon — renders a signal-bar icon sized and colored by priority level.
 *
 * Priority levels (domain values):
 *   9 = urgent   → danger token  (status-text-danger)
 *   5 = important → warning token (status-text-warning)
 *   3 = medium   → blue/info token (status-text-info)
 *   1 = low      → muted token  (fg-muted)
 */
export type Priority = 1 | 3 | 5 | 9

interface PriorityIconProps {
  priority: Priority
  /** Tailwind size class, e.g. "size-3.5". Defaults to "size-3.5" */
  className?: string
}

/** Maps priority → Tailwind color class using design-system tokens */
const COLOR_CLASS: Record<Priority, string> = {
  9: 'text-status-text-danger',
  5: 'text-status-text-warning',
  3: 'text-status-text-info',
  1: 'text-fg-muted',
}

/** Number of filled bars (out of 4) per priority */
const FILLED_BARS: Record<Priority, number> = {
  9: 4,
  5: 3,
  3: 2,
  1: 1,
}

/** SVG y-coordinates for bar tops (bars grow upward from y=12) */
const BAR_Y_POSITIONS = [9, 7, 5, 3] as const

export function PriorityIcon({ priority, className = 'size-3.5' }: PriorityIconProps) {
  const colorClass = COLOR_CLASS[priority]
  const filled = FILLED_BARS[priority]

  return (
    <svg
      viewBox="0 0 12 12"
      fill="none"
      role="img"
      aria-label={`Priority ${priority}`}
      className={`${className} ${colorClass} flex-shrink-0`}
    >
      {BAR_Y_POSITIONS.map((y, i) => {
        const isFilled = i < filled
        const barH = 12 - y
        return (
          <rect
            key={y}
            x={i * 3}
            y={y}
            width={2}
            height={barH}
            rx={0.5}
            fill="currentColor"
            fillOpacity={isFilled ? 1 : 0.25}
          />
        )
      })}
    </svg>
  )
}
