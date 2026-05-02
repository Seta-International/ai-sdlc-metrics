'use client'

import { use } from 'react'
import { useSession } from '@future/auth'
import { BackfillProgressSlideover } from '../../backfill-progress-slideover'

export default function BackfillProgressPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = use(params)
  const session = useSession()

  if (!session) return null

  return (
    <BackfillProgressSlideover
      open={true}
      onOpenChange={() => {}}
      jobId={jobId}
      tenantId={session.tenantId}
    />
  )
}
