// apps/web-people/src/app/offboarding/[caseId]/page.tsx
'use client'

import { useParams } from 'next/navigation'
import { OffboardingCaseDetail } from '../../../components/offboarding/offboarding-case-detail'

export default function OffboardingCaseDetailPage() {
  const params = useParams()
  return (
    <main className="container mx-auto py-8 space-y-6">
      <OffboardingCaseDetail caseId={params.caseId as string} />
    </main>
  )
}
