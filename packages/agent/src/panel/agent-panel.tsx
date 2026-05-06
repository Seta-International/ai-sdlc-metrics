'use client'

import { useMemo } from 'react'
import { QueryClient, QueryClientProvider } from '@future/api-client'
import { AssistantRuntimeProvider, useLocalRuntime } from '@assistant-ui/react'
import { useStore } from 'zustand'
import { useAgentContext } from '../context/use-agent-context'
import { AgentThread } from '../thread/agent-thread'
import { AgentComposer } from '../thread/agent-composer'
import { createAgentChatAdapter } from '../runtime/agent-chat-adapter'
import { createAgentTurnStore } from '../runtime/agent-turn-store'
import { AgentPanelHeader } from './agent-panel-header'
import { AgentPanelMetaStrip } from './agent-panel-meta-strip'
import { AgentChatRail } from './rail/agent-chat-rail'
import { useCollapsedState } from './rail/use-collapsed-state'

export interface AgentPanelProps {
  endpoint?: string
}

export function AgentPanel({ endpoint = '/api/agent/turn' }: AgentPanelProps) {
  const ctx = useAgentContext()
  const [collapsed, setCollapsed] = useCollapsedState(ctx?.module ?? 'unknown')

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
  const queryClient = useMemo(() => new QueryClient(), [])

  if (collapsed) {
    return <AgentChatRail onExpand={() => setCollapsed(false)} />
  }

  const handleNewThread = () => {
    store.getState().reset()
  }

  return (
    <QueryClientProvider client={queryClient}>
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
    </QueryClientProvider>
  )
}
