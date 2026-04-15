import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { ProfileHeader } from './profile-header'
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

describe('ProfileHeader', () => {
  it('renders full name', () => {
    render(
      <ProfileHeader
        profile={baseProfile}
        canEdit={false}
        canManage={false}
        isSelf={false}
        onEdit={vi.fn()}
        onShare={vi.fn()}
      />,
    )
    expect(screen.getByText('Alice Johnson')).toBeTruthy()
  })

  it('renders job title from currentJob', () => {
    render(
      <ProfileHeader
        profile={baseProfile}
        canEdit={false}
        canManage={false}
        isSelf={false}
        onEdit={vi.fn()}
        onShare={vi.fn()}
      />,
    )
    expect(screen.getByText('Senior Engineer')).toBeTruthy()
  })

  it('shows status badge', () => {
    render(
      <ProfileHeader
        profile={baseProfile}
        canEdit={false}
        canManage={false}
        isSelf={false}
        onEdit={vi.fn()}
        onShare={vi.fn()}
      />,
    )
    expect(screen.getByText('Active')).toBeTruthy()
  })

  it('shows probation alert when probation.status === in_progress', () => {
    const profileWithProbation: EmployeeProfile = {
      ...baseProfile,
      probation: {
        id: 'prob-1',
        status: 'in_progress',
        startDate: '2024-01-01',
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]!,
        originalEndDate: '2024-06-30',
        extensions: [],
        salaryPercentage: 85,
        outcome: null,
        outcomeDate: null,
      },
    }
    render(
      <ProfileHeader
        profile={profileWithProbation}
        canEdit={false}
        canManage={false}
        isSelf={false}
        onEdit={vi.fn()}
        onShare={vi.fn()}
      />,
    )
    expect(screen.getByText(/Probation ends in/)).toBeTruthy()
  })

  it('hides Edit Profile button when canEdit is false', () => {
    render(
      <ProfileHeader
        profile={baseProfile}
        canEdit={false}
        canManage={false}
        isSelf={false}
        onEdit={vi.fn()}
        onShare={vi.fn()}
      />,
    )
    expect(screen.queryByText('Edit Profile')).toBeNull()
  })

  it('shows Edit Profile button when canEdit is true', () => {
    render(
      <ProfileHeader
        profile={baseProfile}
        canEdit={true}
        canManage={false}
        isSelf={false}
        onEdit={vi.fn()}
        onShare={vi.fn()}
      />,
    )
    expect(screen.getByText('Edit Profile')).toBeTruthy()
  })

  it('hides dropdown menu when canManage is false', () => {
    render(
      <ProfileHeader
        profile={baseProfile}
        canEdit={false}
        canManage={false}
        isSelf={false}
        onEdit={vi.fn()}
        onShare={vi.fn()}
      />,
    )
    // The dropdown trigger button with MoreHorizontal should not be present
    // We check by querying for "Download PDF" in the menu content - it shouldn't be rendered when canManage is false
    // The MoreHorizontal button is only rendered when canManage is true
    const buttons = screen.queryAllByRole('button')
    // Only Share button should be present (no edit, no more menu)
    const shareButton = buttons.find((btn) => btn.textContent?.includes('Share'))
    expect(shareButton).toBeTruthy()
    // No more-horizontal button
    expect(screen.queryByText('Download PDF')).toBeNull()
  })

  it('shows dropdown menu when canManage is true', () => {
    render(
      <ProfileHeader
        profile={baseProfile}
        canEdit={false}
        canManage={true}
        isSelf={false}
        onEdit={vi.fn()}
        onShare={vi.fn()}
      />,
    )
    // The DropdownMenuTrigger button should exist
    const buttons = screen.getAllByRole('button')
    expect(buttons.length).toBeGreaterThan(1)
  })
})
