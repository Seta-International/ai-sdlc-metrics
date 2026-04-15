import { BulkWizard } from '../../components/bulk/bulk-wizard'

export default function BulkOperationsPage() {
  return (
    <main className="container mx-auto py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-[510] tracking-[-0.288px] text-[#f7f8f8]">Bulk Operations</h1>
        <p className="mt-1 text-sm text-[#8a8f98]">Apply changes to multiple employees at once.</p>
      </div>
      <BulkWizard />
    </main>
  )
}
