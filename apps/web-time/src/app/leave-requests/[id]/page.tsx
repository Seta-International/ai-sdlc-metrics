import { AgentContextProvider, AgentBadge, AgentInlineAction, AgentBanner } from '@future/agent'
import { BookOpen, Lightbulb } from 'lucide-react'

export default function LeaveRequestPage({ params }: { params: { id: string } }) {
  return (
    <AgentContextProvider module="time" entity="leave-request" id={params.id} metadata={{}}>
      <AgentBanner />
      <div className="p-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">Leave Request</h1>
          <AgentBadge />
        </div>
        <div className="mt-4">
          <AgentInlineAction
            actions={[
              { key: 'check-policy', label: 'Check Policy', icon: BookOpen },
              { key: 'suggest-alternatives', label: 'Suggest Alternatives', icon: Lightbulb },
            ]}
          />
        </div>
        <p className="mt-4 text-muted-foreground">Leave Request detail page — coming soon.</p>
      </div>
    </AgentContextProvider>
  )
}
