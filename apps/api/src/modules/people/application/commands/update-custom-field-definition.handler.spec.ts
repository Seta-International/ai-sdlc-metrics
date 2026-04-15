import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UpdateCustomFieldDefinitionCommand } from './update-custom-field-definition.command'
import { UpdateCustomFieldDefinitionHandler } from './update-custom-field-definition.handler'
import type { ICustomFieldDefinitionRepository } from '../../domain/repositories/custom-field-definition.repository'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const ACTOR_ID = '01900000-0000-7000-8000-000000000002'
const DEF_ID = '01900000-0000-7000-8000-000000000003'

const baseDefinition = {
  id: DEF_ID,
  tenantId: TENANT_ID,
  fieldKey: 'tshirt_size',
  label: 'T-Shirt Size',
  fieldType: 'select' as const,
  fieldGroup: null,
  isRequired: false,
  isSearchable: false,
  isFilterable: false,
  sortOrder: 0,
  validation: null,
  options: [{ value: 'S', label: 'Small' }],
  visibilityTier: 'public' as const,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
}

describe('UpdateCustomFieldDefinitionHandler', () => {
  let handler: UpdateCustomFieldDefinitionHandler
  let defRepo: ICustomFieldDefinitionRepository

  beforeEach(() => {
    defRepo = {
      findById: vi.fn(),
      findByFieldKey: vi.fn(),
      findByTenant: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
    }
    handler = new UpdateCustomFieldDefinitionHandler(defRepo)
  })

  it('updates allowed fields', async () => {
    vi.mocked(defRepo.findById).mockResolvedValue(baseDefinition)
    vi.mocked(defRepo.update).mockResolvedValue({ ...baseDefinition, label: 'Updated Label' })

    const result = await handler.execute(
      new UpdateCustomFieldDefinitionCommand(TENANT_ID, DEF_ID, ACTOR_ID, 'Updated Label'),
    )

    expect(defRepo.update).toHaveBeenCalledWith(DEF_ID, TENANT_ID, { label: 'Updated Label' })
    expect(result.label).toBe('Updated Label')
  })

  it('throws when definition not found', async () => {
    vi.mocked(defRepo.findById).mockResolvedValue(null)

    await expect(
      handler.execute(
        new UpdateCustomFieldDefinitionCommand(TENANT_ID, DEF_ID, ACTOR_ID, 'New Label'),
      ),
    ).rejects.toThrow()
  })

  it('updates isActive to false (deactivation)', async () => {
    vi.mocked(defRepo.findById).mockResolvedValue(baseDefinition)
    vi.mocked(defRepo.update).mockResolvedValue({ ...baseDefinition, isActive: false })

    const result = await handler.execute(
      new UpdateCustomFieldDefinitionCommand(
        TENANT_ID,
        DEF_ID,
        ACTOR_ID,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        false,
      ),
    )

    expect(defRepo.update).toHaveBeenCalledWith(DEF_ID, TENANT_ID, { isActive: false })
    expect(result.isActive).toBe(false)
  })
})
