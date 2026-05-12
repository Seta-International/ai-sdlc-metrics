import type { Tool } from '@seta/agent-core'
import { z } from 'zod'

const Input = z.object({ planId: z.string().min(1).optional() })
const Output = z.object({ rows: z.array(z.unknown()) })

export function workloadAnalysisTool(): Tool<z.infer<typeof Input>, z.infer<typeof Output>> {
  return {
    id: 'planner.workload_analysis',
    description: 'Aggregate Planner task load per assignee for a plan. Returns chart-ready data.',
    inputSchema: Input as never,
    outputSchema: Output as never,
    annotations: { readOnlyHint: true },
    async execute(_input, _ctx) {
      return {
        ok: false,
        error: { name: 'NotImplemented', message: 'workload_analysis coming in Phase I' },
      }
    },
  }
}
