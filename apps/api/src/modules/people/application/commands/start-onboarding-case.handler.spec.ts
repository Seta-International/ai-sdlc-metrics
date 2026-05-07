import { describe, it, expect, vi, beforeEach } from 'vitest'
import { StartOnboardingCaseCommand } from './start-onboarding-case.command'
import { StartOnboardingCaseHandler } from './start-onboarding-case.handler'
import {
  OnboardingCaseAlreadyExistsException,
  NoOnboardingTemplateException,
  EmploymentNotFoundException,
} from '../../domain/exceptions/people.exceptions'
import type { IOnboardingCaseRepository } from '../../domain/repositories/onboarding-case.repository'
import type { IOnboardingTemplateRepository } from '../../domain/repositories/onboarding-template.repository'
import type { IEmploymentRepository } from '../../domain/repositories/employment.repository'
import type { Employment } from '../../domain/entities/employment.entity'
import type { OnboardingTemplate } from '../../domain/entities/onboarding-template.entity'
import type { OnboardingCase } from '../../domain/entities/onboarding-case.entity'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const ACTOR_ID = '01900000-0000-7000-8000-000000000002'
const EMPLOYMENT_ID = '01900000-0000-7000-8000-000000000003'
const TEMPLATE_ID = '01900000-0000-7000-8000-000000000004'
const CASE_ID = '01900000-0000-7000-8000-000000000005'

function makeEmployment(overrides: Partial<Employment> = {}): Employment {
  return {
    id: EMPLOYMENT_ID,
    tenantId: TENANT_ID,
    personProfileId: '01900000-0000-7000-8000-000000000010',
    previousProfileId: null,
    employeeCode: 'E001',
    companyEmail: null,
    workerType: 'employee',
    employmentType: 'permanent',
    countryCode: 'VN',
    employmentStatus: 'active',
    terminationDate: null,
    terminationReason: null,
    hireDate: new Date('2026-05-01'),
    originalHireDate: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

function makeTemplate(overrides: Partial<OnboardingTemplate> = {}): OnboardingTemplate {
  return {
    id: TEMPLATE_ID,
    tenantId: TENANT_ID,
    name: 'Default Onboarding',
    countryCode: null,
    workerType: null,
    employmentType: null,
    isDefault: true,
    isActive: true,
    ...overrides,
  }
}

type TaskTemplate = {
  id: string
  tenantId: string
  templateId: string
  title: string
  description: string | null
  assigneeRole: string
  dueDaysAfterHire: number
  isRequired: boolean
}

function makeTaskTemplate(overrides: Partial<TaskTemplate> = {}): TaskTemplate {
  return {
    id: '01900000-0000-7000-8000-000000000020',
    tenantId: TENANT_ID,
    templateId: TEMPLATE_ID,
    title: 'Sign contract',
    description: null,
    assigneeRole: 'hr',
    dueDaysAfterHire: 3,
    isRequired: true,
    ...overrides,
  }
}

function makeCase(overrides: Partial<OnboardingCase> = {}): OnboardingCase {
  return {
    id: CASE_ID,
    tenantId: TENANT_ID,
    employmentId: EMPLOYMENT_ID,
    templateId: TEMPLATE_ID,
    status: 'in_progress',
    stage: 'offer_accepted',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

describe('StartOnboardingCaseHandler', () => {
  let caseRepo: Partial<IOnboardingCaseRepository>
  let templateRepo: Partial<IOnboardingTemplateRepository>
  let employmentRepo: Partial<IEmploymentRepository>

  beforeEach(() => {
    caseRepo = {
      findByEmploymentId: vi.fn().mockResolvedValue(null),
      insert: vi.fn().mockResolvedValue(makeCase()),
      insertTask: vi.fn().mockResolvedValue(undefined),
    }
    templateRepo = {
      findById: vi.fn().mockResolvedValue(null),
      findByEmploymentType: vi.fn().mockResolvedValue(null),
      findDefault: vi.fn().mockResolvedValue(makeTemplate()),
      getTaskTemplates: vi.fn().mockResolvedValue([]),
    }
    employmentRepo = {
      findById: vi.fn().mockResolvedValue(makeEmployment()),
    }
  })

  function makeHandler() {
    return new StartOnboardingCaseHandler(
      caseRepo as IOnboardingCaseRepository,
      templateRepo as IOnboardingTemplateRepository,
      employmentRepo as IEmploymentRepository,
    )
  }

  it('inserts case with stage offer_accepted and calls insertTask for each template task', async () => {
    const tasks = [makeTaskTemplate(), makeTaskTemplate({ id: 'task-2', title: 'Setup equipment' })]
    vi.mocked(templateRepo.getTaskTemplates!).mockResolvedValue(tasks)

    await makeHandler().execute(
      new StartOnboardingCaseCommand(TENANT_ID, ACTOR_ID, EMPLOYMENT_ID, null),
    )

    expect(caseRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({ stage: 'offer_accepted', status: 'in_progress' }),
    )
    expect(caseRepo.insertTask).toHaveBeenCalledTimes(2)
  })

  it('throws EmploymentNotFoundException when employment does not exist', async () => {
    vi.mocked(employmentRepo.findById!).mockResolvedValue(null)

    await expect(
      makeHandler().execute(
        new StartOnboardingCaseCommand(TENANT_ID, ACTOR_ID, EMPLOYMENT_ID, null),
      ),
    ).rejects.toThrow(EmploymentNotFoundException)
  })

  it('throws OnboardingCaseAlreadyExistsException when a case already exists', async () => {
    vi.mocked(caseRepo.findByEmploymentId!).mockResolvedValue(makeCase())

    await expect(
      makeHandler().execute(
        new StartOnboardingCaseCommand(TENANT_ID, ACTOR_ID, EMPLOYMENT_ID, null),
      ),
    ).rejects.toThrow(OnboardingCaseAlreadyExistsException)
  })

  it('uses provided templateId and skips fallback lookups', async () => {
    const specificTemplate = makeTemplate({ id: 'specific-tmpl' })
    vi.mocked(templateRepo.findById!).mockResolvedValue(specificTemplate)

    await makeHandler().execute(
      new StartOnboardingCaseCommand(TENANT_ID, ACTOR_ID, EMPLOYMENT_ID, 'specific-tmpl'),
    )

    expect(templateRepo.findById).toHaveBeenCalledWith('specific-tmpl', TENANT_ID)
    expect(templateRepo.findByEmploymentType).not.toHaveBeenCalled()
    expect(templateRepo.findDefault).not.toHaveBeenCalled()
  })

  it('falls back to employment-type template when no templateId given', async () => {
    const empTypeTemplate = makeTemplate({ id: 'emp-type-tmpl' })
    vi.mocked(templateRepo.findByEmploymentType!).mockResolvedValue(empTypeTemplate)

    await makeHandler().execute(
      new StartOnboardingCaseCommand(TENANT_ID, ACTOR_ID, EMPLOYMENT_ID, null),
    )

    expect(templateRepo.findById).not.toHaveBeenCalled()
    expect(templateRepo.findByEmploymentType).toHaveBeenCalledWith('permanent', TENANT_ID)
    expect(templateRepo.findDefault).not.toHaveBeenCalled()
  })

  it('falls back to default template when employment-type template returns null', async () => {
    vi.mocked(templateRepo.findByEmploymentType!).mockResolvedValue(null)
    const defaultTemplate = makeTemplate({ id: 'default-tmpl', isDefault: true })
    vi.mocked(templateRepo.findDefault!).mockResolvedValue(defaultTemplate)

    await makeHandler().execute(
      new StartOnboardingCaseCommand(TENANT_ID, ACTOR_ID, EMPLOYMENT_ID, null),
    )

    expect(templateRepo.findByEmploymentType).toHaveBeenCalled()
    expect(templateRepo.findDefault).toHaveBeenCalledWith(TENANT_ID)
  })

  it('throws NoOnboardingTemplateException when all template lookups return null', async () => {
    vi.mocked(templateRepo.findByEmploymentType!).mockResolvedValue(null)
    vi.mocked(templateRepo.findDefault!).mockResolvedValue(null)

    await expect(
      makeHandler().execute(
        new StartOnboardingCaseCommand(TENANT_ID, ACTOR_ID, EMPLOYMENT_ID, null),
      ),
    ).rejects.toThrow(NoOnboardingTemplateException)
  })

  it('calculates dueDate correctly from hireDate and dueDaysAfterHire', async () => {
    vi.mocked(employmentRepo.findById!).mockResolvedValue(
      makeEmployment({ hireDate: new Date('2026-05-01') }),
    )
    vi.mocked(templateRepo.getTaskTemplates!).mockResolvedValue([
      makeTaskTemplate({ dueDaysAfterHire: 7 }),
    ])

    await makeHandler().execute(
      new StartOnboardingCaseCommand(TENANT_ID, ACTOR_ID, EMPLOYMENT_ID, null),
    )

    expect(caseRepo.insertTask).toHaveBeenCalledWith(
      expect.objectContaining({ dueDate: new Date('2026-05-08') }),
    )
  })
})
