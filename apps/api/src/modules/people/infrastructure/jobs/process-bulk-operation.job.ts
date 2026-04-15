import { Injectable, Logger, Inject } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import {
  BULK_OPERATION_REPOSITORY,
  type IBulkOperationRepository,
} from '../../domain/repositories/bulk-operation.repository'
import {
  JOB_ASSIGNMENT_REPOSITORY,
  type IJobAssignmentRepository,
} from '../../domain/repositories/job-assignment.repository'
import { CreateJobAssignmentCommand } from '../../application/commands/create-job-assignment.command'

export const PROCESS_BULK_OPERATION_JOB = 'people.process-bulk-operation'

@Injectable()
export class ProcessBulkOperationJob {
  private readonly logger = new Logger(ProcessBulkOperationJob.name)

  constructor(
    @Inject(BULK_OPERATION_REPOSITORY)
    private readonly bulkOpRepo: IBulkOperationRepository,
    @Inject(JOB_ASSIGNMENT_REPOSITORY)
    private readonly jobAssignmentRepo: IJobAssignmentRepository,
    private readonly commandBus: CommandBus,
  ) {}

  async handle(payload: { bulkOperationId: string; tenantId: string }): Promise<void> {
    const op = await this.bulkOpRepo.findById(payload.bulkOperationId, payload.tenantId)
    if (!op) return

    await this.bulkOpRepo.updateStatus(op.id, payload.tenantId, 'processing')

    let successCount = 0
    let failureCount = 0
    const errors: Record<string, string> = {}

    for (const employmentId of op.employmentIds) {
      try {
        if (op.operationType === 'department_transfer') {
          // Look up current job assignment to carry forward the job profile
          const currentAssignment = await this.jobAssignmentRepo.findCurrent(
            employmentId,
            payload.tenantId,
          )
          if (!currentAssignment) {
            throw new Error(`No current job assignment found for employment ${employmentId}`)
          }

          await this.commandBus.execute(
            new CreateJobAssignmentCommand(
              payload.tenantId,
              employmentId,
              currentAssignment.jobProfileId,
              op.payload.effectiveFrom as Date,
              'reorg',
              op.requestedBy,
              op.payload.newDepartmentId as string,
              undefined,
              undefined,
              undefined,
              undefined,
              op.payload.reason as string,
            ),
          )
        }
        successCount++
      } catch (error) {
        failureCount++
        errors[employmentId] = error instanceof Error ? error.message : String(error)
      }
    }

    await this.bulkOpRepo.updateProgress(
      op.id,
      payload.tenantId,
      successCount,
      failureCount,
      Object.keys(errors).length > 0 ? errors : null,
    )

    await this.bulkOpRepo.updateStatus(
      op.id,
      payload.tenantId,
      failureCount === 0
        ? 'completed'
        : failureCount === op.totalCount
          ? 'failed'
          : 'partially_completed',
    )
  }
}
