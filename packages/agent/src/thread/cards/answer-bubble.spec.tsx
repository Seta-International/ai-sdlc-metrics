import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { AnswerBubble } from './answer-bubble'

describe('AnswerBubble', () => {
  it('renders text content', () => {
    render(<AnswerBubble>Hello world</AnswerBubble>)
    expect(screen.getByText('Hello world')).toBeTruthy()
  })

  it('renders shape caption when provided', () => {
    render(<AnswerBubble shape="markdown">x</AnswerBubble>)
    expect(screen.getByText('markdown')).toBeTruthy()
  })

  it('omits shape caption when undefined', () => {
    const { container } = render(<AnswerBubble>x</AnswerBubble>)
    expect(container.querySelector('[data-testid="answer-shape"]')).toBeNull()
  })
})
