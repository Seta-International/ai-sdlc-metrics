import { AgentContextProvider, AgentBadge, AgentInlineAction, AgentBanner } from '@future/agent'
import { BarChart2, Pencil } from 'lucide-react'

export default function ReviewCyclePage({ params }: { params: { id: string } }) {
  return (
    <AgentContextProvider module="performance" entity="review-cycle" id={params.id} metadata={{}}>
      <AgentBanner />
      <div className="p-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">Review Cycle</h1>
          <AgentBadge />
        </div>
        <div className="mt-4">
          <AgentInlineAction
            actions={[
              { key: 'progress-summary', label: 'Progress Summary', icon: BarChart2 },
              { key: 'draft-feedback', label: 'Draft Feedback', icon: Pencil },
            ]}
          />
        </div>
        <p className="mt-4 text-muted-foreground">Review Cycle detail page — coming soon.</p>
      </div>
    </AgentContextProvider>
  )
}
