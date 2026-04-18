import { ReportsSidebar } from '../../components/reports/ReportsSidebar'

export default function ReportsLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="container mx-auto py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-510 tracking-h2 text-fg-primary">Reports</h1>
        <p className="mt-1 text-sm text-fg-muted">HR analytics and compliance dashboards.</p>
      </div>
      <div className="flex gap-8">
        <ReportsSidebar />
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </main>
  )
}
