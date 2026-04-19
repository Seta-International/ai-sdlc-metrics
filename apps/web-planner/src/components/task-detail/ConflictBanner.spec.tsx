import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import React from 'react'
import { ConflictBanner } from './ConflictBanner'

afterEach(() => {
  cleanup()
})

describe('ConflictBanner', () => {
  it('renders nothing when conflictingField is null', () => {
    const { container } = render(
      <ConflictBanner
        conflictingField={null}
        myValue="Mine"
        theirValue="Theirs"
        onKeepMine={vi.fn()}
        onKeepTheirs={vi.fn()}
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders conflict UI with both values when field is set', () => {
    render(
      <ConflictBanner
        conflictingField="title"
        myValue="My title"
        theirValue="Their title"
        onKeepMine={vi.fn()}
        onKeepTheirs={vi.fn()}
      />,
    )
    expect(screen.getByText(/Conflict on "title"/)).toBeDefined()
    expect(screen.getByText(/My title/)).toBeDefined()
    expect(screen.getByText(/Their title/)).toBeDefined()
  })

  it('"Keep mine" button calls onKeepMine', () => {
    const onKeepMine = vi.fn()
    render(
      <ConflictBanner
        conflictingField="title"
        myValue="Mine"
        theirValue="Theirs"
        onKeepMine={onKeepMine}
        onKeepTheirs={vi.fn()}
      />,
    )
    screen.getByText('Keep mine').click()
    expect(onKeepMine).toHaveBeenCalledOnce()
  })

  it('"Keep theirs" button calls onKeepTheirs', () => {
    const onKeepTheirs = vi.fn()
    render(
      <ConflictBanner
        conflictingField="title"
        myValue="Mine"
        theirValue="Theirs"
        onKeepMine={vi.fn()}
        onKeepTheirs={onKeepTheirs}
      />,
    )
    screen.getByText('Keep theirs').click()
    expect(onKeepTheirs).toHaveBeenCalledOnce()
  })
})
