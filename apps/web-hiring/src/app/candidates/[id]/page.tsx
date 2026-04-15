import { AgentContextProvider, AgentBadge, AgentInlineAction, AgentBanner } from '@future/agent'
import { Star, MessageSquare } from 'lucide-react'

export default function CandidatePage({ params }: { params: { id: string } }) {
  return (
    <AgentContextProvider module="hiring" entity="candidate" id={params.id} metadata={{}}>
      <AgentBanner />
      <div className="p-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">Candidate</h1>
          <AgentBadge />
        </div>
        <div className="mt-4">
          <AgentInlineAction
            actions={[
              { key: 'score-against-jd', label: 'Score Against JD', icon: Star },
              {
                key: 'draft-interview-questions',
                label: 'Draft Interview Questions',
                icon: MessageSquare,
              },
            ]}
          />
        </div>
        <p className="mt-4 text-muted-foreground">Candidate detail page — coming soon.</p>
      </div>
    </AgentContextProvider>
  )
}
