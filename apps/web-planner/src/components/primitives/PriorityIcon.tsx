export type Priority = 1 | 3 | 5 | 9

interface PriorityIconProps {
  priority: Priority
  className?: string
}

export function PriorityIcon({ priority, className = 'size-3.5' }: PriorityIconProps) {
  // Low: 2 filled bars + 1 dim bar (3-bar ascending chart)
  if (priority === 1) {
    return (
      <svg
        viewBox="0 0 12 12"
        fill="none"
        role="img"
        aria-label="Low"
        className={`${className} flex-shrink-0`}
      >
        <rect x={1} y={8} width={2} height={3} rx={0.5} fill="#62666d" />
        <rect x={5} y={5} width={2} height={6} rx={0.5} fill="#62666d" />
        <rect x={9} y={2} width={2} height={9} rx={0.5} fill="rgba(138,143,152,0.25)" />
      </svg>
    )
  }

  // Normal: horizontal dash line
  if (priority === 3) {
    return (
      <svg
        viewBox="0 0 12 12"
        fill="none"
        role="img"
        aria-label="Normal"
        className={`${className} flex-shrink-0`}
      >
        <line
          x1={2}
          y1={6}
          x2={10}
          y2={6}
          stroke="#8a8f98"
          strokeWidth={1.5}
          strokeLinecap="round"
        />
      </svg>
    )
  }

  // Important: 3 bars all fully filled
  if (priority === 5) {
    return (
      <svg
        viewBox="0 0 12 12"
        fill="none"
        role="img"
        aria-label="Important"
        className={`${className} flex-shrink-0`}
      >
        <rect x={1} y={8} width={2} height={3} rx={0.5} fill="#d0d6e0" />
        <rect x={5} y={5} width={2} height={6} rx={0.5} fill="#d0d6e0" />
        <rect x={9} y={2} width={2} height={9} rx={0.5} fill="#d0d6e0" />
      </svg>
    )
  }

  // Urgent (9): amber square + ! path
  return (
    <svg
      viewBox="0 0 12 12"
      fill="none"
      role="img"
      aria-label="Urgent"
      className={`${className} flex-shrink-0`}
    >
      <rect x={1} y={1} width={10} height={10} rx={2} fill="#f59e0b" />
      <path d="M6 3.5v3.5M6 9v.5" stroke="#0a0a0b" strokeWidth={1.5} strokeLinecap="round" />
    </svg>
  )
}
