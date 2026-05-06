import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { CustomFieldsSection } from './CustomFieldsSection'

vi.mock('@/lib/trpc', () => ({
  trpc: {
    planner: {
      customFields: {
        setValue: { mutate: vi.fn() },
      },
    },
  },
}))

import { trpc } from '@/lib/trpc'
const mockMutate = vi.mocked(trpc.planner.customFields.setValue.mutate)

const fields = [
  {
    defId: 'f1',
    name: 'Score',
    kind: 'number' as const,
    choiceOptions: null,
    position: 0,
    value: null,
  },
  {
    defId: 'f2',
    name: 'Done?',
    kind: 'yes_no' as const,
    choiceOptions: null,
    position: 1,
    value: { yesNo: true },
  },
  {
    defId: 'f3',
    name: 'Status',
    kind: 'choice' as const,
    choiceOptions: ['Open', 'Closed'],
    position: 2,
    value: null,
  },
]

describe('CustomFieldsSection', () => {
  beforeEach(() => {
    mockMutate.mockReset()
  })

  it('renders each field by name', () => {
    render(
      <CustomFieldsSection fields={fields} taskId="t1" planId="p1" tenantId="tn1" actorId="a1" />,
    )
    expect(screen.getByText('Score')).toBeInTheDocument()
    expect(screen.getByText('Done?')).toBeInTheDocument()
    expect(screen.getByText('Status')).toBeInTheDocument()
  })

  it('calls setValue mutation on number input blur', async () => {
    render(
      <CustomFieldsSection fields={fields} taskId="t1" planId="p1" tenantId="tn1" actorId="a1" />,
    )
    const input = screen.getByTestId('cf-input-f1')
    fireEvent.change(input, { target: { value: '99' } })
    fireEvent.blur(input)
    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({ fieldDefId: 'f1', value: { number: 99 } }),
      )
    })
  })

  it('renders yes_no field with initial checked state', () => {
    render(
      <CustomFieldsSection fields={fields} taskId="t1" planId="p1" tenantId="tn1" actorId="a1" />,
    )
    const checkbox = screen.getByTestId('cf-input-f2')
    expect(checkbox).toBeChecked()
  })

  it('renders nothing when fields is empty', () => {
    const { container } = render(
      <CustomFieldsSection fields={[]} taskId="t1" planId="p1" tenantId="tn1" actorId="a1" />,
    )
    expect(container.firstChild).toBeNull()
  })
})
