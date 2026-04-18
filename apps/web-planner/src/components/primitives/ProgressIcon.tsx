/**
 * ProgressIcon — shows task completion state.
 *
 * Progress values (domain):
 *   0   = not started → empty circle (muted)
 *   50  = in progress → half-filled circle (brand/accent)
 *   100 = complete    → filled circle with checkmark (emerald/success)
 */
export type Progress = 0 | 50 | 100

interface ProgressIconProps {
  progress: Progress
  className?: string
}

export function ProgressIcon({ progress, className = 'size-3.5' }: ProgressIconProps) {
  if (progress === 100) {
    // Filled circle with checkmark — success/emerald token
    return (
      <svg
        viewBox="0 0 14 14"
        fill="none"
        role="img"
        aria-label="Complete"
        className={`${className} text-emerald flex-shrink-0`}
      >
        <circle cx={7} cy={7} r={6} fill="currentColor" />
        <path
          d="M4.5 7l2 2 3-3"
          stroke="white"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )
  }

  if (progress === 50) {
    // Half-filled circle — brand color
    return (
      <svg
        viewBox="0 0 14 14"
        fill="none"
        role="img"
        aria-label="In progress"
        className={`${className} text-brand flex-shrink-0`}
      >
        {/* Outline ring */}
        <circle cx={7} cy={7} r={6} stroke="currentColor" strokeWidth={1.5} />
        {/* Half-fill via arc path: top semicircle */}
        <path d="M7 1 A6 6 0 0 1 7 13 Z" fill="currentColor" />
      </svg>
    )
  }

  // progress === 0 — empty circle, muted
  return (
    <svg
      viewBox="0 0 14 14"
      fill="none"
      role="img"
      aria-label="Not started"
      className={`${className} text-fg-muted flex-shrink-0`}
    >
      <circle cx={7} cy={7} r={6} stroke="currentColor" strokeWidth={1.5} />
    </svg>
  )
}
