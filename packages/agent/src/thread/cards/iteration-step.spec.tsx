import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { IterationStep } from './iteration-step'

describe('IterationStep', () => {
  it('shows running state with auto-open body', () => {
    render(
      <IterationStep
        n={1}
        subAgentDomain="planner"
        selectionReason="first match"
        state="running"
      />,
    )
    expect(screen.getByText(/planner/)).toBeTruthy()
    expect(screen.getByText('first match')).toBeTruthy()
  })

  it('starts collapsed when state is passed', () => {
    render(
      <IterationStep n={1} subAgentDomain="planner" selectionReason="first match" state="passed" />,
    )
    expect(screen.queryByText('first match')).toBeNull()
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText('first match')).toBeTruthy()
  })

  it('renders scorerResults when present', () => {
    render(
      <IterationStep
        n={2}
        subAgentDomain="people"
        selectionReason="r"
        state="passed"
        scorerResults={[{ scorer: 'safety', passed: true }]}
      />,
    )
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText('safety')).toBeTruthy()
    expect(screen.getByText('pass')).toBeTruthy()
  })

  it('renders scorer score value when present', () => {
    render(
      <IterationStep
        n={2}
        subAgentDomain="people"
        selectionReason="r"
        state="passed"
        scorerResults={[{ scorer: 'quality', passed: false, score: 0.42 }]}
      />,
    )
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText('fail')).toBeTruthy()
    expect(screen.getByText('0.42')).toBeTruthy()
  })

  it('keeps body open when state is failed', () => {
    render(<IterationStep n={1} subAgentDomain="planner" selectionReason="r" state="failed" />)
    expect(screen.getByText('r')).toBeTruthy()
  })
})
