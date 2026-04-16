import { BulkWizard } from '../../components/bulk/bulk-wizard'

export default function BulkOperationsPage() {
  return (
    <main className="container mx-auto p-3 space-y-6">
      <div>
        <h1 className="text-2xl font-510 tracking-h2 text-fg-primary">Bulk Operations</h1>
        <p className="mt-1 text-sm text-fg-muted">Apply changes to multiple employees at once.</p>
      </div>
      <BulkWizard />
    </main>
  )
}
