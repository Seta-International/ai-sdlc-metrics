import { describe, expect, it } from 'vitest'
import { router, publicProcedure } from './trpc-init'

describe('trpc-init', () => {
  it('should allow creating a procedure with permission meta', () => {
    const testRouter = router({
      test: publicProcedure.meta({ permission: 'people:profile:read' }).query(() => 'ok'),
    })
    expect(testRouter).toBeDefined()
  })

  it('should allow creating a procedure without permission meta', () => {
    const testRouter = router({
      test: publicProcedure.query(() => 'ok'),
    })
    expect(testRouter).toBeDefined()
  })

  it('should allow creating a procedure with empty meta', () => {
    const testRouter = router({
      test: publicProcedure.meta({}).query(() => 'ok'),
    })
    expect(testRouter).toBeDefined()
  })
})
