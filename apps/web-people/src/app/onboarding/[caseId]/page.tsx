// apps/web-people/src/app/onboarding/[caseId]/page.tsx
'use client'

import { useParams } from 'next/navigation'
import { OnboardingCaseDetail } from '../../../components/onboarding/OnboardingCaseDetail'

export default function OnboardingCaseDetailPage() {
  const params = useParams()
  return (
    <main className="container mx-auto p-3 space-y-6">
      <OnboardingCaseDetail caseId={params.caseId as string} />
    </main>
  )
}
