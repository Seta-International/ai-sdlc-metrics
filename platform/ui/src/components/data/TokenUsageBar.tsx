const fmt = new Intl.NumberFormat('en-US')

interface Props {
  tokensIn: number
  tokensOut: number
  className?: string
}

export function TokenUsageBar({ tokensIn, tokensOut, className }: Props) {
  const total = Math.max(tokensIn + tokensOut, 1)
  const inPct = (tokensIn / total) * 100
  const outPct = (tokensOut / total) * 100
  return (
    <div className={className}>
      <div className="flex items-center justify-between text-[12px] tnum text-ink-mute">
        <span>In: {fmt.format(tokensIn)}</span>
        <span>Out: {fmt.format(tokensOut)}</span>
      </div>
      <div className="mt-1 flex h-2 overflow-hidden rounded-full bg-canvas-subtle">
        <div data-bar="in" className="bg-info" style={{ width: `${inPct}%` }} />
        <div data-bar="out" className="bg-primary" style={{ width: `${outPct}%` }} />
      </div>
    </div>
  )
}
