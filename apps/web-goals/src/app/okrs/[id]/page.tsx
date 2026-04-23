import { AgentContextProvider, AgentBadge, AgentInlineAction, AgentBanner } from '@future/agent'
import { TrendingUp, Lightbulb } from '@future/ui/icons'

export default function OkrPage({ params }: { params: { id: string } }) {
  return (
    <AgentContextProvider module="goals" entity="okr" id={params.id} metadata={{}}>
      <AgentBanner />
      <div className="p-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">OKR</h1>
          <AgentBadge />
        </div>
        <div className="mt-4">
          <AgentInlineAction
            actions={[
              { key: 'progress-forecast', label: 'Progress Forecast', icon: TrendingUp },
              { key: 'suggest-key-results', label: 'Suggest Key Results', icon: Lightbulb },
            ]}
          />
        </div>
        <p className="mt-4 text-muted-foreground">OKR detail page — coming soon.</p>
      </div>
    </AgentContextProvider>
  )
}
