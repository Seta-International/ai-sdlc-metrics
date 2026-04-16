'use client'

import { useState, useCallback } from 'react'
import { X, MessageSquare } from 'lucide-react'
import type { AgentMessage as AgentMessageType } from '../types'
import { useAgentState } from '../hooks/use-agent-state'
import { AgentMessage } from './agent-message'
import { AgentContextPills } from './agent-context-pills'
import { AgentMessageInput } from './agent-message-input'

export function AgentPanel() {
  const { setPanelOpen } = useAgentState()
  const [messages, setMessages] = useState<AgentMessageType[]>([])

  const handleSend = useCallback((content: string) => {
    const userMessage: AgentMessageType = {
      id: crypto.randomUUID(),
      sessionId: 'local',
      role: 'user',
      content,
      createdAt: new Date(),
    }
    setMessages((prev) => [...prev, userMessage])
    // TODO: send via tRPC mutation once session is active
  }, [])

  return (
    <div data-testid="agent-panel" className="h-full w-96 flex-shrink-0 border-l border-border">
      <div className="dark flex h-full min-h-0 flex-col bg-sidebar shadow-lg">
        {/* Header */}
        <div className="flex h-12 items-center justify-between border-b border-sidebar-border px-4">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-510">Agent</span>
          </div>
          <button
            onClick={() => setPanelOpen(false)}
            aria-label="Close agent panel"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-transparent text-muted-foreground transition-all hover:border-border hover:bg-(--btn-ghost-bg) hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring/50"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Context pills */}
        <AgentContextPills />

        {/* Messages — only this area scrolls */}
        <div className="min-h-0 flex-1 overflow-y-auto py-2">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
              <MessageSquare className="h-8 w-8 opacity-40" />
              <p className="text-sm">Start a conversation</p>
            </div>
          ) : (
            messages.map((msg) => <AgentMessage key={msg.id} message={msg} />)
          )}
        </div>

        {/* Input — pinned to bottom */}
        <AgentMessageInput onSend={handleSend} />
      </div>
    </div>
  )
}
