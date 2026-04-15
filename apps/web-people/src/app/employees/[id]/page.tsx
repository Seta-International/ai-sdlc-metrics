import { AgentContextProvider, AgentBadge, AgentInlineAction, AgentBanner } from '@future/agent'
import { Sparkles, UserMinus } from 'lucide-react'

export default function EmployeePage({ params }: { params: { id: string } }) {
  return (
    <AgentContextProvider module="people" entity="employee" id={params.id} metadata={{}}>
      <AgentBanner />
      <div className="p-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">Employee</h1>
          <AgentBadge />
        </div>
        <div className="mt-4">
          <AgentInlineAction
            actions={[
              { key: 'summarize', label: 'Summarize', icon: Sparkles },
              { key: 'draft-offboarding', label: 'Draft Offboarding', icon: UserMinus },
            ]}
          />
        </div>
        <p className="mt-4 text-muted-foreground">Employee detail page — coming soon.</p>
      </div>
    </AgentContextProvider>
  )
}
