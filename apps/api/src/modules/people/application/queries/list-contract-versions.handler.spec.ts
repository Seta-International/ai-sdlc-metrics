import { beforeEach, describe, expect, it } from 'vitest'
import { ListContractVersionsQuery } from './list-contract-versions.query'
import { ListContractVersionsHandler } from './list-contract-versions.handler'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const PROFILE_ID = '01900000-0000-7000-8000-000000000002'

describe('ListContractVersionsHandler', () => {
  let handler: ListContractVersionsHandler

  beforeEach(() => {
    handler = new ListContractVersionsHandler()
  })

  it('returns empty array (stub — contract versions not yet implemented)', async () => {
    const result = await handler.execute(new ListContractVersionsQuery(TENANT_ID, PROFILE_ID))

    expect(result).toEqual([])
  })
})
