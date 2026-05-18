import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Label } from './Label'

describe('Label', () => {
  it('renders a label tied to an input via htmlFor', () => {
    render(
      <>
        <Label htmlFor="name">Name</Label>
        <input id="name" />
      </>,
    )
    expect(screen.getByLabelText('Name')).toBeInTheDocument()
  })

  it('forwards className', () => {
    render(<Label className="custom">x</Label>)
    expect(screen.getByText('x')).toHaveClass('custom')
  })
})
