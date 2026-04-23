import { AgentContextProvider, AgentBadge, AgentInlineAction, AgentBanner } from '@future/agent'
import { AlertTriangle, FileText } from '@future/ui/icons'

export default function ProjectPage({ params }: { params: { id: string } }) {
  return (
    <AgentContextProvider module="projects" entity="project" id={params.id} metadata={{}}>
      <AgentBanner />
      <div className="p-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">Project</h1>
          <AgentBadge />
        </div>
        <div className="mt-4">
          <AgentInlineAction
            actions={[
              { key: 'staffing-risk', label: 'Staffing Risk', icon: AlertTriangle },
              { key: 'generate-status-update', label: 'Generate Status Update', icon: FileText },
            ]}
          />
        </div>
        <p className="mt-4 text-muted-foreground">Project detail page — coming soon.</p>
      </div>
    </AgentContextProvider>
  )
}
