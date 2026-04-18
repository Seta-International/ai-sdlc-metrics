/**
 * LabelPill — small colored pill for a plan label.
 * Color comes from the plan's label definition (a CSS color string).
 * Max width with truncation prevents layout overflow.
 */
interface LabelPillProps {
  name: string
  /** CSS color value from plan_label.color (e.g. '#5e6ad2' or 'var(--color-brand)') */
  color: string
}

export function LabelPill({ name, color }: LabelPillProps) {
  return (
    <span
      className="inline-flex max-w-20 items-center truncate rounded-full px-1.5 py-px text-label font-510 leading-none"
      style={{
        backgroundColor: `color-mix(in srgb, ${color} 18%, transparent)`,
        color,
        border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
      }}
      title={name}
    >
      {name}
    </span>
  )
}
