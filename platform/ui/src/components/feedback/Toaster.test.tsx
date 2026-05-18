import { act, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Toaster, useToast } from './Toaster'

function Harness() {
  const { toast } = useToast()
  return (
    <button type="button" onClick={() => toast({ title: 'Saved', variant: 'success' })}>
      fire
    </button>
  )
}

describe('Toaster', () => {
  it('renders queued toasts', async () => {
    render(
      <Toaster>
        <Harness />
      </Toaster>,
    )
    act(() => {
      screen.getByText('fire').click()
    })
    expect(await screen.findByText('Saved')).toBeInTheDocument()
  })
})
