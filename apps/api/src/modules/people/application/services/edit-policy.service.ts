import { Inject, Injectable } from '@nestjs/common'
import {
  FIELD_EDIT_POLICY_REPOSITORY,
  type IFieldEditPolicyRepository,
} from '../../domain/repositories/field-edit-policy.repository'
import type { EditMode } from '../../domain/entities/field-edit-policy.entity'

export interface EditPolicyResolution {
  editMode: EditMode
  requiresApproval: boolean
  canEdit: boolean
}

@Injectable()
export class EditPolicyService {
  constructor(
    @Inject(FIELD_EDIT_POLICY_REPOSITORY)
    private readonly policyRepo: IFieldEditPolicyRepository,
  ) {}

  async resolveEditMode(
    tenantId: string,
    fieldPath: string,
    isHR: boolean,
  ): Promise<EditPolicyResolution> {
    const policy = await this.policyRepo.findByFieldPath(fieldPath, tenantId)
    const editMode: EditMode = policy?.editMode ?? 'hr_approval'

    switch (editMode) {
      case 'self_service':
        return { editMode, requiresApproval: false, canEdit: true }
      case 'manager_approval':
        return { editMode, requiresApproval: true, canEdit: true }
      case 'hr_approval':
        return { editMode, requiresApproval: true, canEdit: true }
      case 'hr_only':
        return { editMode, requiresApproval: false, canEdit: isHR }
    }
  }
}
