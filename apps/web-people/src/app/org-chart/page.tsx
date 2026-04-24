import { OrgChartTree } from '../../components/OrgChartTree'

export default function OrgChartPage() {
  return (
    <main className="flex min-h-content-lg flex-col gap-4 p-4">
      <div className="space-y-1">
        <h1 className="text-heading-2 font-510 tracking-h2 text-fg-primary">Org chart</h1>
        <p className="text-sm text-fg-muted">
          This read-only view starts from your reporting context: manager, peers, and direct
          reports.
        </p>
        <p className="text-xs text-fg-subtle">
          Looking for someone by name? Use People Directory search.
        </p>
      </div>
      <OrgChartTree />
    </main>
  )
}
