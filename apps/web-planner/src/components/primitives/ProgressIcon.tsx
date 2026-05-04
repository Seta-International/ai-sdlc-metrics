export type Progress = 0 | 50 | 100

interface ProgressIconProps {
  progress: Progress
  className?: string
}

export function ProgressIcon({ progress, className = 'size-3.5' }: ProgressIconProps) {
  if (progress === 100) {
    return (
      <svg
        viewBox="0 0 14 14"
        fill="none"
        role="img"
        aria-label="Complete"
        className={`${className} flex-shrink-0`}
      >
        <circle cx={7} cy={7} r={6} fill="#10b981" />
        <path
          d="M4.5 7l2 2 3-3"
          stroke="#0a0a0b"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )
  }

  if (progress === 50) {
    return (
      <svg
        viewBox="0 0 14 14"
        fill="none"
        role="img"
        aria-label="In progress"
        className={`${className} flex-shrink-0`}
      >
        <circle cx={7} cy={7} r={6} stroke="#f59e0b" strokeWidth={1.5} />
        <path d="M7 1 A6 6 0 0 1 7 13 Z" fill="#f59e0b" />
      </svg>
    )
  }

  // progress === 0 — dashed circle, always visible
  return (
    <svg
      viewBox="0 0 14 14"
      fill="none"
      role="img"
      aria-label="Not started"
      className={`${className} flex-shrink-0`}
    >
      <circle cx={7} cy={7} r={6} stroke="#62666d" strokeWidth={1.5} strokeDasharray="2 2" />
    </svg>
  )
}
