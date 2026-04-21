import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { projectToSchema, SchemaMismatchError } from './project-to-schema'

const Phase1Output = z.object({
  summary: z.string(),
  semantics: z.string(),
  confidence: z.enum(['high', 'med', 'low']),
  sourceToolProvenance: z.array(z.string()),
})

describe('projectToSchema', () => {
  it('projects a subset of keys (field drop only)', () => {
    const input = {
      summary: 'S',
      semantics: 'M',
      confidence: 'high',
      sourceToolProvenance: ['t1'],
    }
    const target = Phase1Output.pick({ summary: true, semantics: true })
    expect(projectToSchema(input, target)).toEqual({ summary: 'S', semantics: 'M' })
  })

  it('does not transform, coerce, or compute fields', () => {
    const input = { summary: 'S', semantics: 'M', confidence: 'high', sourceToolProvenance: [] }
    const target = Phase1Output.pick({ summary: true })
    const output = projectToSchema(input, target)
    expect(output).toEqual({ summary: 'S' })
    expect(Object.keys(output)).toHaveLength(1)
  })

  it('throws SchemaMismatchError when a required target key is absent from input', () => {
    const input = { summary: 'S' } as unknown as z.infer<typeof Phase1Output>
    const target = Phase1Output.pick({ summary: true, semantics: true })
    expect(() => projectToSchema(input, target)).toThrow(SchemaMismatchError)
  })

  it('throws SchemaMismatchError on type mismatch, never silently coerces', () => {
    const input = { summary: 'S', semantics: 42 as unknown as string }
    const target = Phase1Output.pick({ summary: true, semantics: true })
    expect(() => projectToSchema(input, target)).toThrow(SchemaMismatchError)
  })
})
