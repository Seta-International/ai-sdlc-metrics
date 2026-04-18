import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { StatusBadge } from './StatusBadge'
import type { EmploymentStatus } from '../lib/types'

describe('StatusBadge', () => {
  afterEach(() => {
    cleanup()
  })

  const cases: Array<{ status: EmploymentStatus; label: string }> = [
    { status: 'active', label: 'Active' },
    { status: 'pre_hire', label: 'Pre-hire' },
    { status: 'on_leave', label: 'On Leave' },
    { status: 'suspended', label: 'Suspended' },
    { status: 'notice_period', label: 'Notice Period' },
    { status: 'terminated', label: 'Terminated' },
  ]

  for (const { status, label } of cases) {
    it(`renders label "${label}" for status "${status}"`, () => {
      render(<StatusBadge status={status} />)
      expect(screen.getByText(label)).toBeTruthy()
    })
  }

  it('accepts an optional className prop without error', () => {
    render(<StatusBadge status="active" className="custom-class" />)
    expect(screen.getByText('Active')).toBeTruthy()
  })
})
