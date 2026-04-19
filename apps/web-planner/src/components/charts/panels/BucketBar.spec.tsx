import { vi, describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

let capturedOnEvents: Record<string, (params: unknown) => void> | undefined

vi.mock('@future/charts', () => ({
  EChart: ({ onEvents }: any) => {
    capturedOnEvents = onEvents
    return <canvas data-testid="echart-canvas" />
  },
}))

import { BucketBar } from './BucketBar'

const buckets = [
  { bucketId: 'b1', bucketName: 'Backlog', count: 5, hint: 'a' },
  { bucketId: 'b2', bucketName: 'In Progress', count: 3, hint: 'b' },
  { bucketId: 'b3', bucketName: 'Done', count: 8, hint: 'c' },
]

describe('BucketBar', () => {
  beforeEach(() => {
    capturedOnEvents = undefined
  })

  it('renders the title', () => {
    const onDrill = vi.fn()
    render(<BucketBar data={buckets} onDrill={onDrill} />)
    expect(screen.getByText('By Bucket')).toBeDefined()
  })

  it('invokes onDrill with the bucketId (not bucketName) when a bar is clicked', () => {
    const onDrill = vi.fn()
    render(<BucketBar data={buckets} onDrill={onDrill} />)
    capturedOnEvents?.click?.({ name: 'Backlog' })
    expect(onDrill).toHaveBeenCalledWith({ field: 'bucket', value: 'b1' })
  })

  it('invokes onDrill with correct bucketId for second bucket', () => {
    const onDrill = vi.fn()
    render(<BucketBar data={buckets} onDrill={onDrill} />)
    capturedOnEvents?.click?.({ name: 'In Progress' })
    expect(onDrill).toHaveBeenCalledWith({ field: 'bucket', value: 'b2' })
  })

  it('does not invoke onDrill for unknown bucket names', () => {
    const onDrill = vi.fn()
    render(<BucketBar data={buckets} onDrill={onDrill} />)
    capturedOnEvents?.click?.({ name: 'Unknown Bucket' })
    expect(onDrill).not.toHaveBeenCalled()
  })
})
