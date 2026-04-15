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
    <div
      data-testid="agent-panel"
      className="fixed right-0 top-0 flex h-full w-[400px] flex-col border-l border-[rgba(255,255,255,0.08)] bg-[#0f1011] shadow-lg"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[rgba(255,255,255,0.08)] px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-medium text-[#f7f8f8]">
          <MessageSquare className="h-4 w-4" />
          Agent
        </div>
        <button
          onClick={() => setPanelOpen(false)}
          className="rounded-md p-1 text-[#8a8f98] hover:bg-[rgba(255,255,255,0.05)]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Context pills */}
      <AgentContextPills />

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-2">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-[#62666d]">
            <MessageSquare className="h-8 w-8 opacity-40" />
            <p className="text-sm">Start a conversation</p>
          </div>
        ) : (
          messages.map((msg) => <AgentMessage key={msg.id} message={msg} />)
        )}
      </div>

      {/* Input */}
      <AgentMessageInput onSend={handleSend} />
    </div>
  )
}
