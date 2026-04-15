import { ReportsSidebar } from '../../components/reports/reports-sidebar'

export default function ReportsLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="container mx-auto py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-[510] tracking-[-0.288px] text-[#f7f8f8]">Reports</h1>
        <p className="mt-1 text-sm text-[#8a8f98]">HR analytics and compliance dashboards.</p>
      </div>
      <div className="flex gap-8">
        <ReportsSidebar />
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </main>
  )
}
