import { OrgChartTree } from '../../components/OrgChartTree'

export default function OrgChartPage() {
  return (
    <main className="flex min-h-content-lg flex-col gap-4 p-4">
      <div>
        <h1 className="text-heading-2 font-510 tracking-h2 text-fg-primary">Org chart</h1>
        <p className="mt-1 text-sm text-fg-muted">
          This read-only view starts from your reporting context: manager, peers, and direct
          reports.
        </p>
        <p className="mt-1 text-xs text-fg-subtle">
          Looking for someone by name? Use People Directory search.
        </p>
      </div>
      <OrgChartTree />
    </main>
  )
}
