import { AgentContextProvider, AgentBadge, AgentInlineAction, AgentBanner } from '@future/agent'
import { CheckCircle, Flag } from '@future/ui/icons'

export default function InvoicePage({ params }: { params: { id: string } }) {
  return (
    <AgentContextProvider module="finance" entity="invoice" id={params.id} metadata={{}}>
      <AgentBanner />
      <div className="p-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">Invoice</h1>
          <AgentBadge />
        </div>
        <div className="mt-4">
          <AgentInlineAction
            actions={[
              { key: 'verify-compliance', label: 'Verify Compliance', icon: CheckCircle },
              { key: 'flag-anomalies', label: 'Flag Anomalies', icon: Flag },
            ]}
          />
        </div>
        <p className="mt-4 text-muted-foreground">Invoice detail page — coming soon.</p>
      </div>
    </AgentContextProvider>
  )
}
