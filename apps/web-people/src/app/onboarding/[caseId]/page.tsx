// apps/web-people/src/app/onboarding/[caseId]/page.tsx
'use client'

import { useParams } from 'next/navigation'
import { OnboardingCaseDetail } from '../../../components/onboarding/onboarding-case-detail'

export default function OnboardingCaseDetailPage() {
  const params = useParams()
  return (
    <main className="container mx-auto py-8 space-y-6">
      <OnboardingCaseDetail caseId={params.caseId as string} />
    </main>
  )
}
