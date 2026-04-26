import { randomUUID } from 'crypto'

export class MsSyncConflictEntity {
  private constructor(
    readonly id: string,
    readonly tenantId: string,
    readonly kind: string,
    readonly taskId: string | null,
    readonly planId: string | null,
    readonly field: string | null,
    readonly mineValue: unknown,
    readonly theirsValue: unknown,
    readonly mineChangedAt: Date | null,
    readonly theirsChangedAt: Date | null,
    readonly resolution: string | null,
    readonly resolvedByActorId: string | null,
    readonly resolvedAt: Date | null,
    readonly rawError: unknown,
    readonly createdAt: Date,
  ) {}

  static reconstitute(props: {
    id: string
    tenantId: string
    kind: string
    taskId: string | null
    planId: string | null
    field: string | null
    mineValue: unknown
    theirsValue: unknown
    mineChangedAt: Date | null
    theirsChangedAt: Date | null
    resolution: string | null
    resolvedByActorId: string | null
    resolvedAt: Date | null
    rawError: unknown
    createdAt: Date
  }): MsSyncConflictEntity {
    return new MsSyncConflictEntity(
      props.id,
      props.tenantId,
      props.kind,
      props.taskId,
      props.planId,
      props.field,
      props.mineValue,
      props.theirsValue,
      props.mineChangedAt,
      props.theirsChangedAt,
      props.resolution,
      props.resolvedByActorId,
      props.resolvedAt,
      props.rawError,
      props.createdAt,
    )
  }

  static forFieldLww(input: {
    tenantId: string
    taskId: string
    field: string
    mineValue: unknown
    theirsValue: unknown
    mineChangedAt?: Date
    theirsChangedAt?: Date
  }): MsSyncConflictEntity {
    return new MsSyncConflictEntity(
      randomUUID(),
      input.tenantId,
      'field_lww',
      input.taskId,
      null,
      input.field,
      input.mineValue,
      input.theirsValue,
      input.mineChangedAt ?? null,
      input.theirsChangedAt ?? null,
      null,
      null,
      null,
      null,
      new Date(),
    )
  }

  static forPush412Exhausted(input: {
    tenantId: string
    taskId: string
    rawError: unknown
  }): MsSyncConflictEntity {
    return new MsSyncConflictEntity(
      randomUUID(),
      input.tenantId,
      'push_412_exhausted',
      input.taskId,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      input.rawError,
      new Date(),
    )
  }

  static forPush403Quota(input: {
    tenantId: string
    taskId?: string
    planId?: string
    limitCode: string
    rawError: unknown
  }): MsSyncConflictEntity {
    return new MsSyncConflictEntity(
      randomUUID(),
      input.tenantId,
      'push_403_quota',
      input.taskId ?? null,
      input.planId ?? null,
      input.limitCode,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      input.rawError,
      new Date(),
    )
  }

  static forPushFailed(input: {
    tenantId: string
    taskId?: string
    planId?: string
    rawError: unknown
  }): MsSyncConflictEntity {
    return new MsSyncConflictEntity(
      randomUUID(),
      input.tenantId,
      'push_failed',
      input.taskId ?? null,
      input.planId ?? null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      input.rawError,
      new Date(),
    )
  }

  static forPullUnresolvedAssignee(input: {
    tenantId: string
    taskId: string
    aadOid: string
  }): MsSyncConflictEntity {
    return new MsSyncConflictEntity(
      randomUUID(),
      input.tenantId,
      'pull_unresolved_assignee',
      input.taskId,
      null,
      null,
      input.aadOid,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      new Date(),
    )
  }

  static forCredentialInvalidated(input: {
    tenantId: string
    reason: string
    rawError: unknown
  }): MsSyncConflictEntity {
    return new MsSyncConflictEntity(
      randomUUID(),
      input.tenantId,
      'credential_invalidated',
      null,
      null,
      null,
      input.reason,
      null,
      null,
      null,
      null,
      null,
      null,
      input.rawError,
      new Date(),
    )
  }

  static forAttachmentUploadFailed(input: {
    tenantId: string
    taskId: string
    attachmentId: string
    rawError: unknown
  }): MsSyncConflictEntity {
    return new MsSyncConflictEntity(
      randomUUID(),
      input.tenantId,
      'attachment_upload_failed',
      input.taskId,
      null,
      input.attachmentId,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      input.rawError,
      new Date(),
    )
  }
}
