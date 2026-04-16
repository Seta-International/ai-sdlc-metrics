// apps/web-people/src/app/change-requests/page.tsx
import { ChangeRequestQueue } from '../../components/change-requests/change-request-queue'

export default function ChangeRequestsPage() {
  return (
    <main className="container mx-auto p-3 space-y-6">
      <div>
        <h1 className="text-2xl font-510 tracking-[-0.288px] text-[#f7f8f8]">Change Requests</h1>
        <p className="mt-1 text-sm text-[#8a8f98]">Review and approve profile change requests.</p>
      </div>
      <ChangeRequestQueue />
    </main>
  )
}
