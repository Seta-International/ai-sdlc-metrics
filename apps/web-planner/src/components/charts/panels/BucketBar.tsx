'use client'
import { EChart } from '@future/charts'
import { bucketBarOption } from '@/lib/echarts-options'
import type { BucketRow } from '@/lib/charts-data'

export function BucketBar({
  data,
  onDrill,
}: {
  data: BucketRow[]
  onDrill: (d: { field: 'bucket'; value: string }) => void
}) {
  const option = bucketBarOption(data)
  return (
    <div className="rounded-lg border border-border p-4">
      <h3 className="mb-3 text-sm font-medium">By Bucket</h3>
      <EChart
        option={option}
        style={{ height: Math.max(160, data.length * 40) }}
        onEvents={{
          click: (p: { name: string }) => {
            const row = data.find((b) => b.bucketName === p.name)
            if (row) onDrill({ field: 'bucket', value: row.bucketId })
          },
        }}
      />
    </div>
  )
}
