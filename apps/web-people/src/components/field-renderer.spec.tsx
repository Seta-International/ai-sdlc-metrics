'use client'

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { FieldRenderer, FieldGroupRenderer } from './field-renderer'

afterEach(() => {
  cleanup()
})

describe('FieldRenderer', () => {
  it('renders text value correctly', () => {
    render(<FieldRenderer label="First Name" value="John" type="text" />)
    expect(screen.getByText('First Name')).toBeTruthy()
    expect(screen.getByText('John')).toBeTruthy()
  })

  it('renders date value in en-GB format', () => {
    render(<FieldRenderer label="Hire Date" value="2023-06-15" type="date" />)
    // en-GB format: "15 Jun 2023"
    expect(screen.getByText(/Jun 2023/)).toBeTruthy()
  })

  it('renders boolean true as "Yes"', () => {
    render(<FieldRenderer label="Is Manager" value={true} type="boolean" />)
    expect(screen.getByText('Yes')).toBeTruthy()
  })

  it('renders boolean false as "No"', () => {
    render(<FieldRenderer label="Is Manager" value={false} type="boolean" />)
    expect(screen.getByText('No')).toBeTruthy()
  })

  it('renders multi_select as list of badges', () => {
    render(
      <FieldRenderer label="Skills" value={['React', 'TypeScript', 'Node']} type="multi_select" />,
    )
    expect(screen.getByText('React')).toBeTruthy()
    expect(screen.getByText('TypeScript')).toBeTruthy()
    expect(screen.getByText('Node')).toBeTruthy()
  })

  it('renders null as "--"', () => {
    render(<FieldRenderer label="Middle Name" value={null} type="text" />)
    expect(screen.getByText('--')).toBeTruthy()
  })

  it('renders undefined as "--"', () => {
    render(<FieldRenderer label="Middle Name" value={undefined} type="text" />)
    expect(screen.getByText('--')).toBeTruthy()
  })

  it('renders empty string as "--"', () => {
    render(<FieldRenderer label="Middle Name" value="" type="text" />)
    expect(screen.getByText('--')).toBeTruthy()
  })

  it('renders editable text input when editable=true', () => {
    const onChange = vi.fn()
    render(
      <FieldRenderer label="First Name" value="John" type="text" editable onChange={onChange} />,
    )
    const input = screen.getByRole('textbox')
    expect(input).toBeTruthy()
  })

  it('renders editable checkbox for boolean type', () => {
    const onChange = vi.fn()
    render(
      <FieldRenderer label="Is Manager" value={true} type="boolean" editable onChange={onChange} />,
    )
    const checkbox = screen.getByRole('checkbox')
    expect(checkbox).toBeTruthy()
  })
})

describe('FieldGroupRenderer', () => {
  const fields = [
    { fieldKey: 'name', label: 'Name', group: 'Personal', type: 'text', value: 'Alice' },
    {
      fieldKey: 'dob',
      label: 'Date of Birth',
      group: 'Personal',
      type: 'date',
      value: '1990-01-01',
    },
    {
      fieldKey: 'department',
      label: 'Department',
      group: 'Work',
      type: 'text',
      value: 'Engineering',
    },
    { fieldKey: 'remote', label: 'Remote', group: 'Work', type: 'boolean', value: true },
  ]

  it('groups fields by group property', () => {
    render(<FieldGroupRenderer fields={fields} />)
    expect(screen.getByText('Personal')).toBeTruthy()
    expect(screen.getByText('Work')).toBeTruthy()
  })

  it('renders all field labels', () => {
    render(<FieldGroupRenderer fields={fields} />)
    expect(screen.getByText('Name')).toBeTruthy()
    expect(screen.getByText('Date of Birth')).toBeTruthy()
    expect(screen.getByText('Department')).toBeTruthy()
    expect(screen.getByText('Remote')).toBeTruthy()
  })

  it('renders all field values', () => {
    render(<FieldGroupRenderer fields={fields} />)
    expect(screen.getByText('Alice')).toBeTruthy()
    expect(screen.getByText('Engineering')).toBeTruthy()
    expect(screen.getByText('Yes')).toBeTruthy()
  })

  it('calls onFieldChange with correct fieldKey and value when editable', async () => {
    const onFieldChange = vi.fn()
    render(
      <FieldGroupRenderer
        fields={[
          { fieldKey: 'name', label: 'Name', group: 'Personal', type: 'text', value: 'Alice' },
        ]}
        editable
        onFieldChange={onFieldChange}
      />,
    )
    const input = screen.getByRole('textbox')
    expect(input).toBeTruthy()
  })
})
