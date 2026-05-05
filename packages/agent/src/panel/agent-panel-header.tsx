import { Sparkles, Plus, PanelRightClose } from '@future/ui/icons'
import { Tag } from '../primitives/tag'
import { IconBtn } from '../primitives/icon-btn'

export interface AgentPanelHeaderProps {
  streaming: boolean
  taskContext: string | null
  onCollapse: () => void
  onNewThread: () => void
}

export function AgentPanelHeader({
  streaming,
  taskContext,
  onCollapse,
  onNewThread,
}: AgentPanelHeaderProps) {
  return (
    <div className="flex h-11 items-center gap-1.5 border-b border-white/[0.05] px-2.5">
      <div className="flex h-5.5 w-5.5 items-center justify-center rounded-sm bg-gradient-to-br from-accent to-accent/60 text-white">
        <Sparkles className="h-3.5 w-3.5" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          Action Intelligence
          {streaming && <Tag variant="success">live</Tag>}
        </div>
        {taskContext && (
          <div className="overflow-hidden text-ellipsis whitespace-nowrap text-xs text-muted-foreground/70">
            on · {taskContext}
          </div>
        )}
      </div>
      <IconBtn aria-label="New thread" title="New thread" onClick={onNewThread}>
        <Plus className="h-3 w-3" />
      </IconBtn>
      <IconBtn aria-label="Collapse panel" title="Collapse" onClick={onCollapse}>
        <PanelRightClose className="h-3.5 w-3.5" />
      </IconBtn>
    </div>
  )
}
