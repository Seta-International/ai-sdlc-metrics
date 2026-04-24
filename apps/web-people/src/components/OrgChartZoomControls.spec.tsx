import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OrgChartZoomControls } from './OrgChartZoomControls'

const defaults = {
  zoom: 1,
  canZoomIn: true,
  canZoomOut: true,
  onZoomIn: vi.fn(),
  onZoomOut: vi.fn(),
  onReset: vi.fn(),
}

describe('OrgChartZoomControls', () => {
  afterEach(cleanup)

  it('displays zoom as rounded integer percentage', () => {
    render(<OrgChartZoomControls {...defaults} zoom={1.1} />)
    expect(screen.getByText('110%')).toBeTruthy()
  })

  it('disables zoom-in button when canZoomIn is false', () => {
    render(<OrgChartZoomControls {...defaults} canZoomIn={false} />)
    expect(screen.getByRole('button', { name: /zoom in/i }).hasAttribute('disabled')).toBe(true)
  })

  it('disables zoom-out button when canZoomOut is false', () => {
    render(<OrgChartZoomControls {...defaults} canZoomOut={false} />)
    expect(screen.getByRole('button', { name: /zoom out/i }).hasAttribute('disabled')).toBe(true)
  })

  it('calls onZoomIn when zoom-in button is clicked', () => {
    const onZoomIn = vi.fn()
    render(<OrgChartZoomControls {...defaults} onZoomIn={onZoomIn} />)
    fireEvent.click(screen.getByRole('button', { name: /zoom in/i }))
    expect(onZoomIn).toHaveBeenCalledTimes(1)
  })

  it('calls onZoomOut when zoom-out button is clicked', () => {
    const onZoomOut = vi.fn()
    render(<OrgChartZoomControls {...defaults} onZoomOut={onZoomOut} />)
    fireEvent.click(screen.getByRole('button', { name: /zoom out/i }))
    expect(onZoomOut).toHaveBeenCalledTimes(1)
  })

  it('calls onReset when reset view button is clicked', () => {
    const onReset = vi.fn()
    render(<OrgChartZoomControls {...defaults} onReset={onReset} />)
    fireEvent.click(screen.getByRole('button', { name: /reset view/i }))
    expect(onReset).toHaveBeenCalledTimes(1)
  })
})
