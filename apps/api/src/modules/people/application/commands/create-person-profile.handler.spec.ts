import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CreatePersonProfileCommand } from './create-person-profile.command'
import { CreatePersonProfileHandler } from './create-person-profile.handler'
import { PersonProfileAlreadyExistsException } from '../../domain/exceptions/people.exceptions'
import type { IPersonProfileRepository } from '../../domain/repositories/person-profile.repository'
import type { PersonProfile } from '../../domain/entities/person-profile.entity'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const ACTOR_ID = '01900000-0000-7000-8000-000000000002'
const CREATED_BY = '01900000-0000-7000-8000-000000000005'
const PROFILE_ID = '01900000-0000-7000-8000-000000000010'

function makeProfile(overrides: Partial<PersonProfile> = {}): PersonProfile {
  return {
    id: PROFILE_ID,
    tenantId: TENANT_ID,
    actorId: ACTOR_ID,
    familyName: 'Nguyễn',
    givenName: 'An',
    middleName: 'Văn',
    fullName: 'Nguyễn Văn An',
    fullNameUnaccented: 'Nguyen Van An',
    preferredName: null,
    nameDisplayOrder: 'family_first',
    dateOfBirth: null,
    gender: null,
    nationality: null,
    maritalStatus: null,
    photoDocumentId: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  }
}

describe('CreatePersonProfileHandler', () => {
  let handler: CreatePersonProfileHandler
  let personProfileRepo: IPersonProfileRepository

  beforeEach(() => {
    personProfileRepo = {
      findById: vi.fn().mockResolvedValue(null),
      findByActorId: vi.fn().mockResolvedValue(null),
      insert: vi.fn().mockResolvedValue(makeProfile()),
      update: vi.fn(),
    } as unknown as IPersonProfileRepository

    handler = new CreatePersonProfileHandler(personProfileRepo)
  })

  it('creates profile with family_first name order (Vietnamese: "Nguyễn Văn An")', async () => {
    const inserted = makeProfile({
      familyName: 'Nguyễn',
      givenName: 'An',
      middleName: 'Văn',
      fullName: 'Nguyễn Văn An',
      fullNameUnaccented: 'Nguyen Van An',
      nameDisplayOrder: 'family_first',
    })
    vi.mocked(personProfileRepo.insert).mockResolvedValue(inserted)

    const result = await handler.execute(
      new CreatePersonProfileCommand(
        TENANT_ID,
        ACTOR_ID,
        'Nguyễn',
        'An',
        'Văn',
        'family_first',
        CREATED_BY,
      ),
    )

    expect(personProfileRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        actorId: ACTOR_ID,
        familyName: 'Nguyễn',
        givenName: 'An',
        middleName: 'Văn',
        fullName: 'Nguyễn Văn An',
        fullNameUnaccented: 'Nguyen Van An',
        nameDisplayOrder: 'family_first',
      }),
    )
    expect(result.fullName).toBe('Nguyễn Văn An')
  })

  it('creates profile with given_first name order (Western: "John Michael Smith")', async () => {
    const inserted = makeProfile({
      familyName: 'Smith',
      givenName: 'John',
      middleName: 'Michael',
      fullName: 'John Michael Smith',
      fullNameUnaccented: 'John Michael Smith',
      nameDisplayOrder: 'given_first',
    })
    vi.mocked(personProfileRepo.insert).mockResolvedValue(inserted)

    const result = await handler.execute(
      new CreatePersonProfileCommand(
        TENANT_ID,
        ACTOR_ID,
        'Smith',
        'John',
        'Michael',
        'given_first',
        CREATED_BY,
      ),
    )

    expect(personProfileRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        familyName: 'Smith',
        givenName: 'John',
        middleName: 'Michael',
        fullName: 'John Michael Smith',
        nameDisplayOrder: 'given_first',
      }),
    )
    expect(result.fullName).toBe('John Michael Smith')
  })

  it('throws PersonProfileAlreadyExistsException when actor already has profile', async () => {
    vi.mocked(personProfileRepo.findByActorId).mockResolvedValue(makeProfile())

    await expect(
      handler.execute(
        new CreatePersonProfileCommand(
          TENANT_ID,
          ACTOR_ID,
          'Nguyễn',
          'An',
          null,
          'family_first',
          CREATED_BY,
        ),
      ),
    ).rejects.toThrow(PersonProfileAlreadyExistsException)

    expect(personProfileRepo.insert).not.toHaveBeenCalled()
  })

  it('computes fullNameUnaccented correctly (strips Vietnamese diacritics)', async () => {
    const inserted = makeProfile({
      familyName: 'Trần',
      givenName: 'Hương',
      middleName: 'Thị',
      fullName: 'Trần Thị Hương',
      fullNameUnaccented: 'Tran Thi Huong',
      nameDisplayOrder: 'family_first',
    })
    vi.mocked(personProfileRepo.insert).mockResolvedValue(inserted)

    await handler.execute(
      new CreatePersonProfileCommand(
        TENANT_ID,
        ACTOR_ID,
        'Trần',
        'Hương',
        'Thị',
        'family_first',
        CREATED_BY,
      ),
    )

    expect(personProfileRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        fullName: 'Trần Thị Hương',
        fullNameUnaccented: 'Tran Thi Huong',
      }),
    )
  })
})
