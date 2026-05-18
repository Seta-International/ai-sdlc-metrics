import type { SetaUIMessage } from '../../lib/chunksToUIMessages'
import type { AgentContext } from '../../types'
import { AgentInput } from './AgentInput'
import { AgentMessageList } from './AgentMessageList'
import { AgentPanelHeader } from './AgentPanelHeader'

interface Props {
  agentContext: AgentContext
  messages: readonly SetaUIMessage[]
  streaming?: boolean
  pending?: boolean
  onClose: () => void
  onSubmit: (text: string, context: AgentContext) => void
}

export function AgentPanel({
  agentContext,
  messages,
  streaming,
  pending,
  onClose,
  onSubmit,
}: Props) {
  return (
    <section
      aria-label="Agent panel"
      className="flex h-full w-full flex-col border-l border-hairline bg-agent-bg"
    >
      <AgentPanelHeader onClose={onClose} />
      <AgentMessageList messages={messages} {...(streaming !== undefined ? { streaming } : {})} />
      <AgentInput
        {...(pending !== undefined ? { pending } : {})}
        onSubmit={(text) => onSubmit(text, agentContext)}
      />
    </section>
  )
}
