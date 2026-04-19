import { renderHook } from '@testing-library/react'
import { useViewRenderedTelemetry } from './useViewRenderedTelemetry'

describe('useViewRenderedTelemetry', () => {
  it('emits exactly one event on mount with the provided payload', () => {
    const emit = vi.fn()
    renderHook(() =>
      useViewRenderedTelemetry(
        { view: 'board', planId: 'p1', taskCount: 42, filterKeys: ['priority'], groupBy: 'bucket' },
        { emit },
      ),
    )
    expect(emit).toHaveBeenCalledTimes(1)
    expect(emit).toHaveBeenCalledWith(
      'planner.view.rendered',
      expect.objectContaining({
        zone: 'web-planner',
        view: 'board',
        planId: 'p1',
        taskCount: 42,
        groupBy: 'bucket',
        filterKeys: ['priority'],
      }),
    )
  })

  it('debounces: successive renders with identical payload emit once', () => {
    const emit = vi.fn()
    const payload = {
      view: 'board' as const,
      planId: 'p1',
      taskCount: 5,
      filterKeys: [] as string[],
      groupBy: 'bucket',
    }
    const { rerender } = renderHook((p) => useViewRenderedTelemetry(p, { emit }), {
      initialProps: payload,
    })
    rerender(payload)
    rerender(payload)
    expect(emit).toHaveBeenCalledTimes(1)
  })

  it('re-emits when view, planId, taskCount, or groupBy change', () => {
    const emit = vi.fn()
    const { rerender } = renderHook((p) => useViewRenderedTelemetry(p, { emit }), {
      initialProps: {
        view: 'board' as const,
        planId: 'p1',
        taskCount: 5,
        filterKeys: [] as string[],
        groupBy: 'bucket',
      },
    })
    rerender({
      view: 'grid' as const,
      planId: 'p1',
      taskCount: 5,
      filterKeys: [] as string[],
      groupBy: 'bucket',
    })
    expect(emit).toHaveBeenCalledTimes(2)
  })

  it('re-emits when filterKeys change', () => {
    const emit = vi.fn()
    const { rerender } = renderHook((p) => useViewRenderedTelemetry(p, { emit }), {
      initialProps: {
        view: 'board' as const,
        planId: 'p1',
        taskCount: 5,
        filterKeys: [] as string[],
        groupBy: 'bucket',
      },
    })
    rerender({
      view: 'board' as const,
      planId: 'p1',
      taskCount: 5,
      filterKeys: ['priority'],
      groupBy: 'bucket',
    })
    expect(emit).toHaveBeenCalledTimes(2)
  })

  it('emits filterKeys sorted regardless of input order', () => {
    const emit = vi.fn()
    renderHook(() =>
      useViewRenderedTelemetry(
        {
          view: 'board',
          planId: 'p1',
          taskCount: 1,
          filterKeys: ['priority', 'due'],
          groupBy: 'bucket',
        },
        { emit },
      ),
    )
    expect(emit).toHaveBeenCalledWith(
      'planner.view.rendered',
      expect.objectContaining({ filterKeys: ['due', 'priority'] }),
    )
  })
})
