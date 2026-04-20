'use client'

import { X, MessageSquare } from 'lucide-react'
import { AssistantRuntimeProvider, useLocalRuntime } from '@assistant-ui/react'
import { useAgentState } from '../hooks/use-agent-state'
import { useAgentContext } from '../context/use-agent-context'
import { AgentContextPills } from './agent-context-pills'
import { AgentThread } from '../thread/agent-thread'
import { AgentComposer } from '../thread/agent-composer'
import { createAgentChatAdapter } from '../runtime/agent-chat-adapter'
import { createAgentTurnStore } from '../runtime/agent-turn-store'
import { useMemo } from 'react'

export interface AgentPanelProps {
  endpoint?: string
}

export function AgentPanel({ endpoint = '/api/agent/turn' }: AgentPanelProps) {
  const { setPanelOpen } = useAgentState()
  const ctx = useAgentContext()

  const store = useMemo(() => createAgentTurnStore(), [])
  const adapter = useMemo(
    () =>
      createAgentChatAdapter({
        endpoint,
        surface: 'panel',
        store,
        context: ctx ?? undefined,
      }),
    [endpoint, store, ctx],
  )
  const runtime = useLocalRuntime(adapter)

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div data-testid="agent-panel" className="h-full w-96 flex-shrink-0 border-l border-border">
        <div className="dark flex h-full min-h-0 flex-col bg-sidebar shadow-lg">
          <PanelHeader onClose={() => setPanelOpen(false)} />
          <AgentContextPills />
          <AgentThread />
          <AgentComposer />
        </div>
      </div>
    </AssistantRuntimeProvider>
  )
}

function PanelHeader({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex h-12 items-center justify-between border-b border-sidebar-border px-4">
      <div className="flex items-center gap-2">
        <MessageSquare className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-510">Agent</span>
      </div>
      <button
        onClick={onClose}
        aria-label="Close agent panel"
        className="flex h-8 w-8 items-center justify-center rounded-full border border-transparent text-muted-foreground transition-all hover:border-border hover:bg-(--btn-ghost-bg) hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring/50"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
