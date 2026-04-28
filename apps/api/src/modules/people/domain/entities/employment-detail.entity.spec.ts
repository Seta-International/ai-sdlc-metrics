import { describe, it, expectTypeOf } from 'vitest'
import type { EmploymentDetail } from './employment-detail.entity'

describe('EmploymentDetail entity shape', () => {
  it('has officeLocation field', () => {
    expectTypeOf<EmploymentDetail>().toHaveProperty('officeLocation')
    expectTypeOf<EmploymentDetail['officeLocation']>().toEqualTypeOf<string | null>()
  })

  it('has workPhone field', () => {
    expectTypeOf<EmploymentDetail>().toHaveProperty('workPhone')
    expectTypeOf<EmploymentDetail['workPhone']>().toEqualTypeOf<string | null>()
  })
})
