import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CreateCustomFieldDefinitionCommand } from './create-custom-field-definition.command'
import { CreateCustomFieldDefinitionHandler } from './create-custom-field-definition.handler'
import type { ICustomFieldDefinitionRepository } from '../../domain/repositories/custom-field-definition.repository'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const ACTOR_ID = '01900000-0000-7000-8000-000000000002'
const DEF_ID = '01900000-0000-7000-8000-000000000003'

describe('CreateCustomFieldDefinitionHandler', () => {
  let handler: CreateCustomFieldDefinitionHandler
  let defRepo: ICustomFieldDefinitionRepository

  beforeEach(() => {
    defRepo = {
      findById: vi.fn(),
      findByFieldKey: vi.fn(),
      findByTenant: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
    }
    handler = new CreateCustomFieldDefinitionHandler(defRepo)
  })

  it('creates a custom field definition', async () => {
    vi.mocked(defRepo.findByFieldKey).mockResolvedValue(null)
    vi.mocked(defRepo.insert).mockResolvedValue({
      id: DEF_ID,
      tenantId: TENANT_ID,
      fieldKey: 'tshirt_size',
      label: 'T-Shirt Size',
      fieldType: 'select',
      fieldGroup: null,
      isRequired: false,
      isSearchable: false,
      isFilterable: false,
      sortOrder: 0,
      validation: null,
      options: [{ value: 'S', label: 'Small' }],
      visibilityTier: 'public',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const result = await handler.execute(
      new CreateCustomFieldDefinitionCommand(
        TENANT_ID,
        'tshirt_size',
        'T-Shirt Size',
        'select',
        ACTOR_ID,
        null,
        false,
        false,
        false,
        0,
        null,
        [{ value: 'S', label: 'Small' }],
        'public',
      ),
    )

    expect(result.id).toBe(DEF_ID)
    expect(defRepo.insert).toHaveBeenCalled()
  })

  it('throws when field key already exists for tenant', async () => {
    vi.mocked(defRepo.findByFieldKey).mockResolvedValue({ id: 'existing' } as any)

    await expect(
      handler.execute(
        new CreateCustomFieldDefinitionCommand(
          TENANT_ID,
          'tshirt_size',
          'T-Shirt Size',
          'select',
          ACTOR_ID,
        ),
      ),
    ).rejects.toThrow()
  })
})
