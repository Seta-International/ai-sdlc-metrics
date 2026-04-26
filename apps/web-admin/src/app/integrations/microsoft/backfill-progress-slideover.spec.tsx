import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { BackfillProgressSlideover } from './backfill-progress-slideover'

// Mock toast from @future/ui
vi.mock('@future/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@future/ui')>()
  return {
    ...actual,
    toast: vi.fn(),
  }
})

import { toast } from '@future/ui'

const mockedToast = vi.mocked(toast)

type EventSourceListener = (event: MessageEvent) => void

interface MockEventSourceInstance {
  onmessage: EventSourceListener | null
  close: ReturnType<typeof vi.fn>
  simulateMessage: (data: unknown) => void
}

let mockEsInstance: MockEventSourceInstance | null = null

class MockEventSource {
  onmessage: EventSourceListener | null = null
  close = vi.fn()

  constructor(_url: string) {
    // Store this instance for test access
    mockEsInstance = this as unknown as MockEventSourceInstance
    ;(mockEsInstance as unknown as { simulateMessage: (data: unknown) => void }).simulateMessage = (
      data: unknown,
    ) => {
      if (this.onmessage) {
        this.onmessage(new MessageEvent('message', { data: JSON.stringify(data) }))
      }
    }
  }
}

describe('<BackfillProgressSlideover />', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEsInstance = null
    vi.stubGlobal('EventSource', MockEventSource)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders "0 / 0 tasks imported" when no data yet', () => {
    render(<BackfillProgressSlideover open={true} onOpenChange={vi.fn()} jobId="job-1" />)

    expect(screen.getByText('0 / 0 tasks imported')).toBeInTheDocument()
  })

  it('progress bar updates when progress events arrive', async () => {
    render(<BackfillProgressSlideover open={true} onOpenChange={vi.fn()} jobId="job-1" />)

    expect(mockEsInstance).not.toBeNull()

    await act(async () => {
      ;(mockEsInstance as unknown as { simulateMessage: (data: unknown) => void }).simulateMessage({
        type: 'progress',
        processed: 30,
        total: 100,
      })
    })

    expect(screen.getByText('30 / 100 tasks imported')).toBeInTheDocument()
  })

  it('closes and toasts on completed event', async () => {
    const onOpenChange = vi.fn()

    render(<BackfillProgressSlideover open={true} onOpenChange={onOpenChange} jobId="job-1" />)

    expect(mockEsInstance).not.toBeNull()

    await act(async () => {
      ;(mockEsInstance as unknown as { simulateMessage: (data: unknown) => void }).simulateMessage({
        type: 'completed',
      })
    })

    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(mockedToast).toHaveBeenCalledWith('Backfill complete')
  })

  it('does not open EventSource when jobId is null', () => {
    render(<BackfillProgressSlideover open={true} onOpenChange={vi.fn()} jobId={null} />)

    expect(mockEsInstance).toBeNull()
  })

  it('calls onOpenChange(false) when Pause is clicked', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()

    render(<BackfillProgressSlideover open={true} onOpenChange={onOpenChange} jobId="job-1" />)

    await user.click(screen.getByRole('button', { name: /Pause/i }))

    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
