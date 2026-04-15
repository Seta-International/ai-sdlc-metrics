import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { TabOverview } from './tab-overview'
import type { EmployeeProfile } from '../../lib/types'

afterEach(() => {
  cleanup()
})

const baseProfile: EmployeeProfile = {
  personProfile: {
    id: 'pp-1',
    actorId: 'actor-1',
    familyName: 'Johnson',
    givenName: 'Alice',
    middleName: null,
    fullName: 'Alice Johnson',
    preferredName: null,
    nameDisplayOrder: 'given_first',
    dateOfBirth: '1990-01-15',
    gender: 'female',
    nationality: 'SG',
    maritalStatus: 'single',
    photoUrl: null,
  },
  employment: {
    id: 'emp-1',
    employeeCode: 'EMP001',
    companyEmail: 'alice@example.com',
    workerType: 'employee',
    employmentType: 'permanent',
    countryCode: 'SG',
    employmentStatus: 'active',
    hireDate: '2021-03-15',
    terminationDate: null,
    terminationReason: null,
    workArrangement: 'hybrid',
  },
  currentJob: {
    id: 'job-1',
    jobProfileId: 'jp-1',
    jobTitle: 'Senior Engineer',
    jobLevel: 'L5',
    jobFamilyName: 'Engineering',
    departmentId: 'dept-1',
    departmentName: 'Engineering',
    locationId: 'loc-1',
    locationName: 'Singapore',
    costCenter: 'CC001',
    managerId: 'mgr-1',
    managerName: 'Bob Smith',
    effectiveDate: '2022-01-01',
  },
  emergencyContacts: [],
  addresses: [],
  countryFields: [],
  customFields: [],
  bankDetails: null,
  probation: null,
  completenessScore: 75,
  completenessMissing: ['dateOfBirth', 'address'],
}

describe('TabOverview', () => {
  it('renders "Personal Information" heading', () => {
    render(
      <TabOverview
        profile={baseProfile}
        canEditPersonal={false}
        canEditEmployment={false}
        canEditBank={false}
      />,
    )
    expect(screen.getByText('Personal Information')).toBeTruthy()
  })

  it('renders "Employment Information" heading', () => {
    render(
      <TabOverview
        profile={baseProfile}
        canEditPersonal={false}
        canEditEmployment={false}
        canEditBank={false}
      />,
    )
    expect(screen.getByText('Employment Information')).toBeTruthy()
  })

  it('renders "No emergency contacts added." when emergencyContacts is empty', () => {
    render(
      <TabOverview
        profile={baseProfile}
        canEditPersonal={false}
        canEditEmployment={false}
        canEditBank={false}
      />,
    )
    expect(screen.getByText('No emergency contacts added.')).toBeTruthy()
  })

  it('renders emergency contact name when contacts present', () => {
    const profileWithContacts: EmployeeProfile = {
      ...baseProfile,
      emergencyContacts: [
        {
          id: 'ec-1',
          name: 'Jane Doe',
          relationship: 'Spouse',
          phone: '+65 9999 0000',
          email: null,
        },
      ],
    }
    render(
      <TabOverview
        profile={profileWithContacts}
        canEditPersonal={false}
        canEditEmployment={false}
        canEditBank={false}
      />,
    )
    expect(screen.getByText('Jane Doe')).toBeTruthy()
  })
})
