import { describe, it, expect, vi } from 'vitest'
import { buildColumns } from './columns'

describe('grid columns', () => {
  it('defines the ten expected columns in order', () => {
    const defs = buildColumns({ editable: true, onOpen: vi.fn(), planMembers: [], planLabels: [] })
    expect(
      defs.map(
        (c) =>
          (c as { id?: string; accessorKey?: string }).id ??
          (c as { accessorKey?: string }).accessorKey,
      ),
    ).toEqual([
      'select',
      'title',
      'bucket',
      'progress',
      'priority',
      'start',
      'due',
      'assignees',
      'labels',
      'actions',
    ])
  })

  it('title + priority + progress + due are sortable; assignees + labels are not', () => {
    const defs = buildColumns({ editable: true, onOpen: vi.fn(), planMembers: [], planLabels: [] })
    const byId = (id: string) =>
      defs.find(
        (d) =>
          (d as { id?: string; accessorKey?: string }).id === id ||
          (d as { accessorKey?: string }).accessorKey === id,
      )
    expect(byId('title')?.enableSorting).toBe(true)
    expect(byId('priority')?.enableSorting).toBe(true)
    expect(byId('progress')?.enableSorting).toBe(true)
    expect(byId('due')?.enableSorting).toBe(true)
    expect(byId('assignees')?.enableSorting).toBe(false)
    expect(byId('labels')?.enableSorting).toBe(false)
  })
})
