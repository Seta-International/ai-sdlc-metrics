// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RejectReasonPicker } from './reject-reason-picker'

describe('RejectReasonPicker', () => {
  afterEach(() => {
    cleanup()
  })

  it('lists all four enum reasons', () => {
    render(<RejectReasonPicker onConfirm={() => {}} onCancel={() => {}} />)

    expect(screen.getByLabelText('not needed')).toBeTruthy()
    expect(screen.getByLabelText('wrong entity')).toBeTruthy()
    expect(screen.getByLabelText('wrong value')).toBeTruthy()
    expect(screen.getByLabelText('other (with note)')).toBeTruthy()
  })

  it('calls onConfirm with the selected enum reason and no note', () => {
    const onConfirm = vi.fn()
    render(<RejectReasonPicker onConfirm={onConfirm} onCancel={() => {}} />)

    fireEvent.click(screen.getByLabelText('wrong value'))
    fireEvent.click(screen.getByRole('button', { name: 'Reject draft' }))

    expect(onConfirm).toHaveBeenCalledWith({ reason: 'wrong_value' })
  })

  it('shows note textarea when other_with_note is selected', () => {
    render(<RejectReasonPicker onConfirm={() => {}} onCancel={() => {}} />)

    fireEvent.click(screen.getByLabelText('other (with note)'))

    expect(screen.getByLabelText('Note')).toBeTruthy()
  })

  it('disables Reject button when other_with_note is selected and note is empty', () => {
    render(<RejectReasonPicker onConfirm={() => {}} onCancel={() => {}} />)

    fireEvent.click(screen.getByLabelText('other (with note)'))

    expect(screen.getByRole('button', { name: 'Reject draft' }).hasAttribute('disabled')).toBe(true)
  })

  it('confirms with note when other_with_note and note text are provided', () => {
    const onConfirm = vi.fn()
    render(<RejectReasonPicker onConfirm={onConfirm} onCancel={() => {}} />)

    fireEvent.click(screen.getByLabelText('other (with note)'))
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'see FUT-1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Reject draft' }))

    expect(onConfirm).toHaveBeenCalledWith({ reason: 'other_with_note', note: 'see FUT-1' })
  })

  it('cancel calls onCancel', () => {
    const onCancel = vi.fn()
    render(<RejectReasonPicker onConfirm={() => {}} onCancel={onCancel} />)

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onCancel).toHaveBeenCalledOnce()
  })
})
