/**
 * SynthesizerOutputSchema — Plan 17 §4.1.
 *
 * Discriminated union over the 5 answer shapes.
 * Pure Zod, zero NestJS imports.
 */

import * as z from 'zod'

const ShortAnswer = z.object({ shape: z.literal('short-answer'), content: z.string().min(1) })
const List = z.object({ shape: z.literal('list'), items: z.array(z.string()).min(1) })
const Table = z.object({
  shape: z.literal('table'),
  columns: z.array(z.string()).min(1),
  rows: z.array(z.array(z.string())),
})
const Narrative = z.object({ shape: z.literal('narrative'), content: z.string().min(1) })
const Chart = z.object({
  shape: z.literal('chart'),
  series: z.array(
    z.object({
      label: z.string(),
      points: z.array(z.object({ x: z.union([z.string(), z.number()]), y: z.number() })),
    }),
  ),
  axes: z.object({ x: z.string(), y: z.string() }),
})

export const SynthesizerOutputSchema = z.discriminatedUnion('shape', [
  ShortAnswer,
  List,
  Table,
  Narrative,
  Chart,
])

export type SynthesizerLlmOutput = z.infer<typeof SynthesizerOutputSchema>

export function narrowToShape(
  _schema: typeof SynthesizerOutputSchema,
  shape: SynthesizerLlmOutput['shape'],
): z.ZodType {
  switch (shape) {
    case 'short-answer':
      return ShortAnswer
    case 'list':
      return List
    case 'table':
      return Table
    case 'narrative':
      return Narrative
    case 'chart':
      return Chart
  }
}
