import { describe, expect, test } from 'vitest'
import * as api from './index'

describe('@seta/agent-vector public surface', () => {
  test('exposes the documented exports', () => {
    expect(api.agentVectorSchema).toBeDefined()
    expect(api.chunks).toBeDefined()
    expect(api.VectorQueryFailedError).toBeDefined()
    expect(api.VectorInsertFailedError).toBeDefined()
  })
})
