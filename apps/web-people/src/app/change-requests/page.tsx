// apps/web-people/src/app/change-requests/page.tsx
import { ChangeRequestQueue } from '../../components/change-requests/change-request-queue'

export default function ChangeRequestsPage() {
  return (
    <main className="container mx-auto p-3 space-y-6">
      <div>
        <h1 className="text-2xl font-510 tracking-h2 text-fg-primary">Change Requests</h1>
        <p className="mt-1 text-sm text-fg-muted">Review and approve profile change requests.</p>
      </div>
      <ChangeRequestQueue />
    </main>
  )
}
