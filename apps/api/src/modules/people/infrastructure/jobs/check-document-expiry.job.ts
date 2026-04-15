import { Inject, Injectable } from '@nestjs/common'
import { EventBus } from '@nestjs/cqrs'
import {
  EMPLOYEE_DOCUMENT_REPOSITORY,
  type IEmployeeDocumentRepository,
} from '../../domain/repositories/employee-document.repository'

@Injectable()
export class CheckDocumentExpiryJob {
  constructor(
    @Inject(EMPLOYEE_DOCUMENT_REPOSITORY)
    private readonly docRepo: IEmployeeDocumentRepository,
    private readonly eventBus: EventBus,
  ) {}

  /**
   * Runs weekly. Emits DocumentExpiringEvent at 30/14/7 day marks.
   */
  async handle(tenantId: string): Promise<void> {
    const today = new Date()
    const thirtyDaysOut = new Date(today)
    thirtyDaysOut.setDate(thirtyDaysOut.getDate() + 30)

    const documents = await this.docRepo.findExpiringBefore(tenantId, thirtyDaysOut)

    for (const doc of documents) {
      if (!doc.expiryDate || doc.status !== 'active') continue

      const daysUntilExpiry = Math.ceil(
        (doc.expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
      )

      if ([30, 14, 7].includes(daysUntilExpiry) || daysUntilExpiry <= 0) {
        this.eventBus.publish({
          type: 'DocumentExpiringEvent',
          tenantId,
          employmentId: doc.employmentId,
          employeeDocumentId: doc.id,
          title: doc.title,
          category: doc.category,
          expiryDate: doc.expiryDate,
          daysRemaining: Math.max(0, daysUntilExpiry),
        })
      }
    }
  }
}
