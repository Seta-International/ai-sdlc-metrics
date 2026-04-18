import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LabelEditor } from './LabelEditor'

const makeLabels = () =>
  Array.from({ length: 25 }, (_, i) => ({
    slot: `category${i + 1}`,
    name: `Label ${i + 1}`,
    color: '#6B7280',
  }))

describe('LabelEditor', () => {
  it('renders 25 label slots', () => {
    const { container } = render(
      <LabelEditor labels={makeLabels()} onRename={vi.fn()} onRecolor={vi.fn()} />,
    )
    expect(container.querySelectorAll('[data-label-slot]')).toHaveLength(25)
  })

  it('shows rename input on slot click and calls onRename on Enter', async () => {
    const onRename = vi.fn()
    const user = userEvent.setup()
    const { container } = render(
      <LabelEditor labels={makeLabels()} onRename={onRename} onRecolor={vi.fn()} />,
    )

    const nameBtn = container.querySelector('[data-label-slot="category1"] button') as HTMLElement
    await user.click(nameBtn)
    const input = screen.getByDisplayValue('Label 1')
    await user.clear(input)
    await user.type(input, 'Urgent{Enter}')

    expect(onRename).toHaveBeenCalledWith('category1', 'Urgent')
  })

  it('calls onRecolor when color input changes', () => {
    const onRecolor = vi.fn()
    const { container } = render(
      <LabelEditor labels={makeLabels()} onRename={vi.fn()} onRecolor={onRecolor} />,
    )

    const colorInput = container.querySelector(
      '[data-label-slot="category1"] input[type="color"]',
    ) as HTMLInputElement
    fireEvent.change(colorInput, { target: { value: '#ff0000' } })

    expect(onRecolor).toHaveBeenCalledWith('category1', 'Label 1', '#ff0000')
  })
})
