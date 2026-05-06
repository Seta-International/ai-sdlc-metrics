'use client'

import { Sparkles, PanelRightOpen } from '@future/ui/icons'
import { IconBtn } from '../../primitives/icon-btn'

export interface AgentChatRailProps {
  onExpand: () => void
}

export function AgentChatRail({ onExpand }: AgentChatRailProps) {
  return (
    <aside
      data-testid="agent-chat-rail"
      className="dark flex h-full w-11 flex-shrink-0 flex-col items-center gap-2 border-l border-white/[0.05] bg-sidebar py-2"
    >
      <div className="flex h-7 w-7 items-center justify-center rounded bg-gradient-to-br from-accent to-accent/60 text-white">
        <Sparkles className="h-3.5 w-3.5" />
      </div>
      <IconBtn aria-label="Expand panel" title="Expand" onClick={onExpand}>
        <PanelRightOpen className="h-3.5 w-3.5" />
      </IconBtn>
    </aside>
  )
}
