import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventBus } from '@nestjs/cqrs'
import { EmployeeRehiredEvent } from '@future/event-contracts'
import {
  InvalidRehireException,
  PersonProfileNotFoundException,
} from '../../domain/exceptions/people.exceptions'
import type { IEmploymentRepository } from '../../domain/repositories/employment.repository'
import type { IPersonProfileRepository } from '../../domain/repositories/person-profile.repository'
import type { Employment } from '../../domain/entities/employment.entity'
import type { PersonProfile } from '../../domain/entities/person-profile.entity'
import type { JobHistoryRecorderService } from '../services/job-history-recorder.service'
import { RehireEmploymentCommand } from './rehire-employment.command'
import { RehireEmploymentHandler } from './rehire-employment.handler'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const PREV_PROFILE_ID = '01900000-0000-7000-8000-000000000020'
const PREV_EMPLOYMENT_ID = '01900000-0000-7000-8000-000000000010'
const NEW_PROFILE_ID = '01900000-0000-7000-8000-000000000030'
const NEW_EMPLOYMENT_ID = '01900000-0000-7000-8000-000000000040'
const ACTOR_ID = '01900000-0000-7000-8000-000000000005'
const REHIRED_BY = '01900000-0000-7000-8000-000000000006'
const REHIRE_DATE = new Date('2026-04-01')

function makePrevProfile(overrides: Partial<PersonProfile> = {}): PersonProfile {
  return {
    id: PREV_PROFILE_ID,
    tenantId: TENANT_ID,
    actorId: 'actor-prev',
    familyName: 'Nguyen',
    middleName: null,
    givenName: 'Anh',
    fullName: 'Nguyen Anh',
    fullNameUnaccented: 'Nguyen Anh',
    preferredName: null,
    nameDisplayOrder: 'familyName_first',
    dateOfBirth: null,
    gender: null,
    nationality: 'VN',
    maritalStatus: null,
    photoDocumentId: null,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  }
}

function makeNewProfile(overrides: Partial<PersonProfile> = {}): PersonProfile {
  return {
    ...makePrevProfile(),
    id: NEW_PROFILE_ID,
    actorId: 'actor-prev',
    ...overrides,
  }
}

function makeTerminatedEmployment(overrides: Partial<Employment> = {}): Employment {
  return {
    id: PREV_EMPLOYMENT_ID,
    tenantId: TENANT_ID,
    personProfileId: PREV_PROFILE_ID,
    previousProfileId: null,
    employeeCode: null,
    companyEmail: null,
    workerType: 'employee',
    employmentType: 'permanent',
    countryCode: 'VN',
    employmentStatus: 'terminated',
    terminationDate: new Date('2026-01-01'),
    terminationReason: 'resignation',
    hireDate: new Date('2025-01-01'),
    originalHireDate: new Date('2025-01-01'),
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  }
}

function makeNewEmployment(overrides: Partial<Employment> = {}): Employment {
  return {
    id: NEW_EMPLOYMENT_ID,
    tenantId: TENANT_ID,
    personProfileId: NEW_PROFILE_ID,
    previousProfileId: PREV_PROFILE_ID,
    employeeCode: null,
    companyEmail: null,
    workerType: 'employee',
    employmentType: 'permanent',
    countryCode: 'VN',
    employmentStatus: 'active',
    terminationDate: null,
    terminationReason: null,
    hireDate: REHIRE_DATE,
    originalHireDate: REHIRE_DATE,
    createdAt: REHIRE_DATE,
    updatedAt: REHIRE_DATE,
    ...overrides,
  }
}

describe('RehireEmploymentHandler', () => {
  let handler: RehireEmploymentHandler
  let profileRepo: IPersonProfileRepository
  let employmentRepo: IEmploymentRepository
  let eventBus: { publish: ReturnType<typeof vi.fn> }
  let recorder: { recordRehire: ReturnType<typeof vi.fn> }

  const makeCmd = () =>
    new RehireEmploymentCommand(
      TENANT_ID,
      PREV_PROFILE_ID,
      REHIRE_DATE,
      'employee',
      'permanent',
      'VN',
      'Senior Engineer',
      'dept-01',
      null,
      REHIRED_BY,
    )

  beforeEach(() => {
    const prevProfile = makePrevProfile()
    const newProfile = makeNewProfile()
    const newEmployment = makeNewEmployment()

    profileRepo = {
      findById: vi.fn().mockResolvedValue(prevProfile),
      findByActorId: vi.fn(),
      insert: vi.fn().mockResolvedValue(newProfile),
      update: vi.fn(),
    } as unknown as IPersonProfileRepository

    employmentRepo = {
      findById: vi.fn(),
      findByPersonProfileId: vi.fn().mockResolvedValue([makeTerminatedEmployment()]),
      findActiveByActorId: vi.fn().mockResolvedValue(null),
      insert: vi.fn().mockResolvedValue(newEmployment),
      updateStatus: vi.fn(),
      update: vi.fn(),
      listByTenant: vi.fn(),
      countByTenant: vi.fn(),
    } as unknown as IEmploymentRepository

    eventBus = { publish: vi.fn().mockResolvedValue(undefined) }
    recorder = { recordRehire: vi.fn().mockResolvedValue(undefined) }

    handler = new RehireEmploymentHandler(
      profileRepo,
      employmentRepo,
      eventBus as unknown as EventBus,
      recorder as unknown as JobHistoryRecorderService,
    )
  })

  describe('happy path', () => {
    it('looks up the previous profile by previousProfileId', async () => {
      await handler.execute(makeCmd())
      expect(profileRepo.findById).toHaveBeenCalledWith(PREV_PROFILE_ID, TENANT_ID)
    })

    it('checks for active employment of the previous actor', async () => {
      const prevProfile = makePrevProfile()
      vi.mocked(profileRepo.findById).mockResolvedValue(prevProfile)

      await handler.execute(makeCmd())

      expect(employmentRepo.findActiveByActorId).toHaveBeenCalledWith(
        prevProfile.actorId,
        TENANT_ID,
      )
    })

    it('inserts a new profile copied from the previous profile using the same actorId', async () => {
      const prevProfile = makePrevProfile()
      vi.mocked(profileRepo.findById).mockResolvedValue(prevProfile)

      await handler.execute(makeCmd())

      expect(profileRepo.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          actorId: prevProfile.actorId,
          familyName: prevProfile.familyName,
          givenName: prevProfile.givenName,
          fullName: prevProfile.fullName,
        }),
      )
    })

    it('inserts a new employment with previousProfileId, active status, and rehireDate as hireDate', async () => {
      const newProfile = makeNewProfile()
      vi.mocked(profileRepo.insert).mockResolvedValue(newProfile)

      await handler.execute(makeCmd())

      expect(employmentRepo.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          previousProfileId: PREV_PROFILE_ID,
          employmentStatus: 'active',
          hireDate: REHIRE_DATE,
          personProfileId: newProfile.id,
        }),
      )
    })

    it('carries originalHireDate forward from previous employment originalHireDate', async () => {
      const prevOriginalHireDate = new Date('2024-03-15')
      const prevEmp = makeTerminatedEmployment({
        originalHireDate: prevOriginalHireDate,
        hireDate: new Date('2025-01-01'),
      })
      vi.mocked(employmentRepo.findByPersonProfileId).mockResolvedValue([prevEmp])

      await handler.execute(makeCmd())

      expect(employmentRepo.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          originalHireDate: prevOriginalHireDate,
        }),
      )
    })

    it('falls back to previous employment hireDate when originalHireDate is null', async () => {
      const prevHireDate = new Date('2025-01-01')
      const prevEmp = makeTerminatedEmployment({ originalHireDate: null, hireDate: prevHireDate })
      vi.mocked(employmentRepo.findByPersonProfileId).mockResolvedValue([prevEmp])

      await handler.execute(makeCmd())

      expect(employmentRepo.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          originalHireDate: prevHireDate,
        }),
      )
    })

    it('falls back to rehireDate when no previous employment records exist', async () => {
      vi.mocked(employmentRepo.findByPersonProfileId).mockResolvedValue([])

      await handler.execute(makeCmd())

      expect(employmentRepo.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          originalHireDate: REHIRE_DATE,
        }),
      )
    })

    it('records a rehire job history entry', async () => {
      const newProfile = makeNewProfile()
      vi.mocked(profileRepo.insert).mockResolvedValue(newProfile)

      await handler.execute(makeCmd())

      expect(recorder.recordRehire).toHaveBeenCalledWith(
        expect.objectContaining({
          profileId: newProfile.id,
          effectiveFrom: REHIRE_DATE,
          tenantId: TENANT_ID,
        }),
      )
    })

    it('publishes EmployeeRehiredEvent', async () => {
      await handler.execute(makeCmd())
      expect(eventBus.publish).toHaveBeenCalledWith(expect.any(EmployeeRehiredEvent))
    })

    it('returns { profileId, employmentId } of the new entities', async () => {
      const newProfile = makeNewProfile()
      const newEmployment = makeNewEmployment()
      vi.mocked(profileRepo.insert).mockResolvedValue(newProfile)
      vi.mocked(employmentRepo.insert).mockResolvedValue(newEmployment)

      const result = await handler.execute(makeCmd())

      expect(result).toEqual({ profileId: newProfile.id, employmentId: newEmployment.id })
    })
  })

  describe('error: previousProfileId not found', () => {
    it('throws PersonProfileNotFoundException when profile does not exist', async () => {
      vi.mocked(profileRepo.findById).mockResolvedValue(null)

      await expect(handler.execute(makeCmd())).rejects.toThrow(PersonProfileNotFoundException)
    })

    it('does not proceed to employment lookup when profile not found', async () => {
      vi.mocked(profileRepo.findById).mockResolvedValue(null)

      await expect(handler.execute(makeCmd())).rejects.toThrow(PersonProfileNotFoundException)

      expect(employmentRepo.findActiveByActorId).not.toHaveBeenCalled()
    })
  })

  describe('error: previous employment exists', () => {
    it('throws InvalidRehireException when active employment exists', async () => {
      vi.mocked(employmentRepo.findActiveByActorId).mockResolvedValue(
        makeTerminatedEmployment({ employmentStatus: 'active' }),
      )

      await expect(handler.execute(makeCmd())).rejects.toThrow(InvalidRehireException)
    })

    it('does not create new profile when previous employment is found', async () => {
      vi.mocked(employmentRepo.findActiveByActorId).mockResolvedValue(
        makeTerminatedEmployment({ employmentStatus: 'active' }),
      )

      await expect(handler.execute(makeCmd())).rejects.toThrow(InvalidRehireException)

      expect(profileRepo.insert).not.toHaveBeenCalled()
    })
  })

  describe('sequential DB calls (no Promise.all)', () => {
    it('calls profileRepo.insert before employmentRepo.insert', async () => {
      const callOrder: string[] = []
      vi.mocked(profileRepo.insert).mockImplementation(async () => {
        callOrder.push('profileRepo.insert')
        return makeNewProfile()
      })
      vi.mocked(employmentRepo.insert).mockImplementation(async () => {
        callOrder.push('employmentRepo.insert')
        return makeNewEmployment()
      })

      await handler.execute(makeCmd())

      expect(callOrder).toEqual(['profileRepo.insert', 'employmentRepo.insert'])
    })
  })
})
