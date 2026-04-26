'use client'

import { use } from 'react'
import { BackfillProgressSlideover } from '../../backfill-progress-slideover'

export default function BackfillProgressPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = use(params)

  return <BackfillProgressSlideover open={true} onOpenChange={() => {}} jobId={jobId} />
}
