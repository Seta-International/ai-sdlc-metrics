import { OrgChartTree } from '../../components/org-chart-tree'

export default function OrgChartPage() {
  return (
    <main className="container mx-auto p-3 space-y-6">
      <div>
        <h1 className="text-2xl font-510 tracking-h2 text-fg-primary">Organization Chart</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Visualize reporting relationships and department structure.
        </p>
      </div>
      <OrgChartTree />
    </main>
  )
}
