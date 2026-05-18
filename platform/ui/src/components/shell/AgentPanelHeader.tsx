import { Bot, X } from 'lucide-react'

interface Props {
  onClose: () => void
}

export function AgentPanelHeader({ onClose }: Props) {
  return (
    <header className="flex h-12 items-center justify-between border-b border-hairline bg-canvas px-4">
      <div className="flex items-center gap-2">
        <Bot className="size-4 stroke-[1.5] text-primary" />
        <span className="text-[14px] font-medium text-ink">Seta Agent</span>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close agent panel"
        className="inline-flex size-7 items-center justify-center rounded-md text-ink-mute hover:bg-canvas-subtle"
      >
        <X className="size-4 stroke-[1.5]" />
      </button>
    </header>
  )
}
