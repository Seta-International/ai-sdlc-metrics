import { Injectable } from '@nestjs/common'

@Injectable()
export class DocumentRequirementCheckerService {
  /**
   * Checks if an uploaded document matches a document_requirement linked
   * to an onboarding task. If matched, auto-completes the task.
   *
   * Called when EmployeeDocumentCreatedEvent is received.
   */
  async checkAndAutoComplete(
    tenantId: string,
    employmentId: string,
    documentCategory: string,
  ): Promise<void> {
    // 1. Find active onboarding case for this employment
    // 2. Find task templates with documentRequirementId matching the category
    // 3. For each matching task that is still 'pending', mark as 'completed'
    // 4. Check if all required tasks are now complete
    // 5. If all complete + hire_date reached, trigger ActivateEmployment
    // Implementation depends on existing onboarding task repository methods.
    // Placeholder — actual implementation wires into existing task completion flow.
  }
}
