'use client'

import { useMemo } from 'react'
import { AssistantRuntimeProvider, useLocalRuntime } from '@assistant-ui/react'
import { useStore } from 'zustand'
import { useAgentState } from '../hooks/use-agent-state'
import { useAgentContext } from '../context/use-agent-context'
import { AgentThread } from '../thread/agent-thread'
import { AgentComposer } from '../thread/agent-composer'
import { createAgentChatAdapter } from '../runtime/agent-chat-adapter'
import { createAgentTurnStore } from '../runtime/agent-turn-store'
import { AgentPanelHeader } from './agent-panel-header'
import { AgentPanelMetaStrip } from './agent-panel-meta-strip'

export interface AgentPanelProps {
  endpoint?: string
}

export function AgentPanel({ endpoint = '/api/agent/turn' }: AgentPanelProps) {
  const { collapsed, setCollapsed } = useAgentState()
  const ctx = useAgentContext()

  const store = useMemo(() => createAgentTurnStore(), [])
  const traceId = useStore(store, (s) => s.traceId)
  const streaming = useStore(store, (s) => s.streaming)
  const usage = useStore(store, (s) => s.usage)

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

  if (collapsed) {
    return (
      <div
        data-testid="agent-panel-rail-slot"
        className="dark h-full w-11 flex-shrink-0 border-l border-white/[0.05] bg-sidebar"
      />
    )
  }

  const handleNewThread = () => {
    store.getState().reset()
  }

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div
        data-testid="agent-panel"
        className="dark h-full w-96 flex-shrink-0 border-l border-white/[0.05] bg-sidebar"
      >
        <div className="flex h-full min-h-0 flex-col">
          <AgentPanelHeader
            streaming={streaming}
            taskContext={ctx?.entity ?? null}
            onCollapse={() => setCollapsed(true)}
            onNewThread={handleNewThread}
          />
          <AgentPanelMetaStrip traceId={traceId} model={null} usage={usage} />
          <div className="flex-1 min-h-0 overflow-auto">
            <AgentThread />
          </div>
          <AgentComposer />
        </div>
      </div>
    </AssistantRuntimeProvider>
  )
}
