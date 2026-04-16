import { OrgChartTree } from '../../components/org-chart-tree'

export default function OrgChartPage() {
  return (
    <main className="container mx-auto p-3 space-y-6">
      <div>
        <h1 className="text-2xl font-510 tracking-[-0.288px] text-[#f7f8f8]">Organization Chart</h1>
        <p className="mt-1 text-sm text-[#8a8f98]">
          Visualize reporting relationships and department structure.
        </p>
      </div>
      <OrgChartTree />
    </main>
  )
}
