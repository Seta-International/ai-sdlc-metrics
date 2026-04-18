'use client'

import { useParams } from 'next/navigation'
import { WorkflowCaseDetail } from '../../../components/workflow/WorkflowCaseDetail'

export default function OnboardingCaseDetailPage() {
  const params = useParams()
  return (
    <main className="container mx-auto p-3 space-y-6">
      <WorkflowCaseDetail type="onboarding" caseId={params.caseId as string} />
    </main>
  )
}
