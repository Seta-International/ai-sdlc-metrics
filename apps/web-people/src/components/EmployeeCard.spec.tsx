import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { EmployeeCard } from './EmployeeCard'
import type { DirectoryRow } from '../lib/types'

afterEach(() => {
  cleanup()
})

const baseEmployee: DirectoryRow = {
  id: 'emp-123',
  personProfileId: 'pp-456',
  avatarUrl: null,
  fullName: 'Alice Johnson',
  preferredName: 'Alice',
  jobTitle: 'Senior Engineer',
  jobLevel: 'L5',
  department: 'Engineering',
  departmentId: 'dept-1',
  location: 'Singapore',
  countryCode: 'SG',
  companyEmail: 'alice@example.com',
  employmentStatus: 'active',
  employmentType: 'permanent',
  workerType: 'employee',
  workArrangement: 'hybrid',
  managerId: 'mgr-1',
  managerName: 'Bob Smith',
  hireDate: '2021-03-15',
}

describe('EmployeeCard', () => {
  it('renders employee full name', () => {
    render(<EmployeeCard employee={baseEmployee} onClick={vi.fn()} />)
    expect(screen.getByText('Alice Johnson')).toBeTruthy()
  })

  it('renders job title', () => {
    render(<EmployeeCard employee={baseEmployee} onClick={vi.fn()} />)
    expect(screen.getByText('Senior Engineer')).toBeTruthy()
  })

  it('renders department name', () => {
    render(<EmployeeCard employee={baseEmployee} onClick={vi.fn()} />)
    expect(screen.getByText('Engineering')).toBeTruthy()
  })

  it('calls onClick with correct employment id when clicked', () => {
    const onClick = vi.fn()
    render(<EmployeeCard employee={baseEmployee} onClick={onClick} />)
    // Click the card element - find by name text and click parent
    const nameEl = screen.getByText('Alice Johnson')
    // Walk up to find the card and click it
    fireEvent.click(nameEl.closest('[class*="cursor-pointer"]') ?? nameEl)
    expect(onClick).toHaveBeenCalledWith('emp-123')
  })

  it('shows initials when no avatarUrl', () => {
    render(<EmployeeCard employee={{ ...baseEmployee, avatarUrl: null }} onClick={vi.fn()} />)
    // First two initials: A (Alice) + J (Johnson)
    expect(screen.getByText('AJ')).toBeTruthy()
  })

  it('shows location when provided', () => {
    render(<EmployeeCard employee={baseEmployee} onClick={vi.fn()} />)
    expect(screen.getByText('Singapore')).toBeTruthy()
  })

  it('does not show location element when location is null', () => {
    render(<EmployeeCard employee={{ ...baseEmployee, location: null }} onClick={vi.fn()} />)
    expect(screen.queryByText('Singapore')).toBeNull()
  })

  it('renders status badge', () => {
    render(<EmployeeCard employee={baseEmployee} onClick={vi.fn()} />)
    expect(screen.getByText('Active')).toBeTruthy()
  })

  it('renders work arrangement when provided', () => {
    render(<EmployeeCard employee={baseEmployee} onClick={vi.fn()} />)
    expect(screen.getByText('hybrid')).toBeTruthy()
  })

  it('does not render work arrangement when null', () => {
    render(<EmployeeCard employee={{ ...baseEmployee, workArrangement: null }} onClick={vi.fn()} />)
    expect(screen.queryByText('hybrid')).toBeNull()
  })
})
