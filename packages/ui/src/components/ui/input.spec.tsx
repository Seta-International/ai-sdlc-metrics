import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Input } from './input'
import { Textarea } from './textarea'

describe('Input', () => {
  it('renders without error', () => {
    render(<Input placeholder="Enter value" />)
    expect(screen.getByPlaceholderText('Enter value')).toBeInTheDocument()
  })

  it('passes data-slot="input"', () => {
    render(<Input />)
    expect(document.querySelector('[data-slot="input"]')).toBeInTheDocument()
  })

  it('is disabled when disabled prop passed', () => {
    render(<Input disabled placeholder="disabled" />)
    expect(screen.getByPlaceholderText('disabled')).toBeDisabled()
  })
})

describe('Textarea', () => {
  it('renders without error', () => {
    render(<Textarea placeholder="Enter text" />)
    expect(screen.getByPlaceholderText('Enter text')).toBeInTheDocument()
  })

  it('passes data-slot="textarea"', () => {
    render(<Textarea />)
    expect(document.querySelector('[data-slot="textarea"]')).toBeInTheDocument()
  })

  it('is disabled when disabled prop passed', () => {
    render(<Textarea disabled placeholder="disabled" />)
    expect(screen.getByPlaceholderText('disabled')).toBeDisabled()
  })
})
