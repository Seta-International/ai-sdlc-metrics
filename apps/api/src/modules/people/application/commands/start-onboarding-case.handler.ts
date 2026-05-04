import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import {
  ONBOARDING_CASE_REPOSITORY,
  type IOnboardingCaseRepository,
} from '../../domain/repositories/onboarding-case.repository'
import {
  ONBOARDING_TEMPLATE_REPOSITORY,
  type IOnboardingTemplateRepository,
} from '../../domain/repositories/onboarding-template.repository'
import {
  EMPLOYMENT_REPOSITORY,
  type IEmploymentRepository,
} from '../../domain/repositories/employment.repository'
import {
  EmploymentNotFoundException,
  OnboardingCaseAlreadyExistsException,
  NoOnboardingTemplateException,
} from '../../domain/exceptions/people.exceptions'
import { StartOnboardingCaseCommand } from './start-onboarding-case.command'

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000)
}

@CommandHandler(StartOnboardingCaseCommand)
export class StartOnboardingCaseHandler implements ICommandHandler<
  StartOnboardingCaseCommand,
  void
> {
  constructor(
    @Inject(ONBOARDING_CASE_REPOSITORY)
    private readonly caseRepo: IOnboardingCaseRepository,
    @Inject(ONBOARDING_TEMPLATE_REPOSITORY)
    private readonly templateRepo: IOnboardingTemplateRepository,
    @Inject(EMPLOYMENT_REPOSITORY)
    private readonly employmentRepo: IEmploymentRepository,
  ) {}

  async execute(command: StartOnboardingCaseCommand): Promise<void> {
    const { tenantId, actorId, employmentId, templateId } = command

    const employment = await this.employmentRepo.findById(employmentId, tenantId)
    if (!employment) throw new EmploymentNotFoundException(employmentId)

    const existing = await this.caseRepo.findByEmploymentId(employmentId, tenantId)
    if (existing) throw new OnboardingCaseAlreadyExistsException(employmentId)

    let template = null
    if (templateId) {
      template = await this.templateRepo.findById(templateId, tenantId)
    }
    if (!template) {
      template = await this.templateRepo.findByEmploymentType(employment.employmentType, tenantId)
    }
    if (!template) {
      template = await this.templateRepo.findDefault(tenantId)
    }
    if (!template) throw new NoOnboardingTemplateException(tenantId)

    const newCase = await this.caseRepo.insert({
      tenantId,
      employmentId,
      templateId: template.id,
      status: 'in_progress',
      stage: 'offer_accepted',
    })

    const taskTemplates = await this.templateRepo.getTaskTemplates(template.id, tenantId)

    for (const t of taskTemplates) {
      await this.caseRepo.insertTask({
        tenantId,
        caseId: newCase.id,
        actorId,
        title: t.title,
        description: t.description,
        assigneeRole: t.assigneeRole,
        isRequired: t.isRequired,
        dueDate: addDays(employment.hireDate, t.dueDaysAfterHire),
      })
    }
  }
}
