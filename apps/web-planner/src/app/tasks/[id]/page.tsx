import { AgentContextProvider, AgentBadge, AgentInlineAction, AgentBanner } from '@future/agent'
import { ArrowUpCircle, Link as LinkIcon } from '@future/ui/icons'

export default function TaskPage({ params }: { params: { id: string } }) {
  return (
    <AgentContextProvider module="planner" entity="task" id={params.id} metadata={{}}>
      <AgentBanner />
      <div className="p-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">Task</h1>
          <AgentBadge />
        </div>
        <div className="mt-4">
          <AgentInlineAction
            actions={[
              { key: 'prioritize', label: 'Prioritize', icon: ArrowUpCircle },
              { key: 'link-to-kpi', label: 'Link to KPI', icon: LinkIcon },
            ]}
          />
        </div>
        <p className="mt-4 text-muted-foreground">Task detail page — coming soon.</p>
      </div>
    </AgentContextProvider>
  )
}
