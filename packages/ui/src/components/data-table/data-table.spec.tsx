'use client'

import * as React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DataTable } from './data-table'
import { defaultTableState, type FutureTableState } from './table-state'
import type { ColumnDef } from '@tanstack/react-table'

type Person = { id: string; name: string; age: number }

const columns: ColumnDef<Person>[] = [
  { id: 'name', accessorKey: 'name', header: 'Name', enableSorting: true },
  { id: 'age', accessorKey: 'age', header: 'Age', enableSorting: true },
]

const rows: Person[] = [
  { id: '1', name: 'Alice', age: 30 },
  { id: '2', name: 'Bob', age: 25 },
]

function makeState(overrides: Partial<FutureTableState> = {}): FutureTableState {
  return { ...defaultTableState, ...overrides }
}

describe('DataTable', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders rows', () => {
    const onStateChange = vi.fn()
    render(
      <DataTable
        columns={columns}
        rows={rows}
        state={makeState()}
        totalCount={2}
        onStateChange={onStateChange}
      />,
    )
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
  })

  it('renders column headers', () => {
    const onStateChange = vi.fn()
    render(
      <DataTable
        columns={columns}
        rows={rows}
        state={makeState()}
        totalCount={2}
        onStateChange={onStateChange}
      />,
    )
    // Column headers appear as sort buttons in the table header
    const nameButtons = screen.getAllByRole('button', { name: /name/i })
    expect(nameButtons.length).toBeGreaterThan(0)
    const ageButtons = screen.getAllByRole('button', { name: /age/i })
    expect(ageButtons.length).toBeGreaterThan(0)
  })

  it('clicking a sortable column header cycles sort direction asc → desc → unsorted', async () => {
    const user = userEvent.setup()
    const onStateChange = vi.fn()
    const { rerender } = render(
      <DataTable
        columns={columns}
        rows={rows}
        state={makeState()}
        totalCount={2}
        onStateChange={onStateChange}
      />,
    )

    // First click → asc — click the sort button inside the table header (first match)
    const nameHeaders = screen.getAllByRole('button', { name: /^name$/i })
    const nameHeader = nameHeaders[0]!
    await user.click(nameHeader)
    expect(onStateChange).toHaveBeenCalledWith(
      expect.objectContaining({
        sorting: [{ field: 'name', direction: 'asc' }],
      }),
    )

    // Rerender with asc state, then click → desc
    rerender(
      <DataTable
        columns={columns}
        rows={rows}
        state={makeState({ sorting: [{ field: 'name', direction: 'asc' }] })}
        totalCount={2}
        onStateChange={onStateChange}
      />,
    )
    const nameHeaders2 = screen.getAllByRole('button', { name: /^name$/i })
    await user.click(nameHeaders2[0]!)
    expect(onStateChange).toHaveBeenCalledWith(
      expect.objectContaining({
        sorting: [{ field: 'name', direction: 'desc' }],
      }),
    )

    // Rerender with desc state, then click → unsorted
    rerender(
      <DataTable
        columns={columns}
        rows={rows}
        state={makeState({ sorting: [{ field: 'name', direction: 'desc' }] })}
        totalCount={2}
        onStateChange={onStateChange}
      />,
    )
    const nameHeaders3 = screen.getAllByRole('button', { name: /^name$/i })
    await user.click(nameHeaders3[0]!)
    expect(onStateChange).toHaveBeenCalledWith(
      expect.objectContaining({
        sorting: [],
      }),
    )
  })

  it('row expansion works', async () => {
    const user = userEvent.setup()
    const onStateChange = vi.fn()
    render(
      <DataTable
        columns={columns}
        rows={rows}
        state={makeState()}
        totalCount={2}
        onStateChange={onStateChange}
        renderExpandedRow={(row) => <div>Detail: {(row as Person).name}</div>}
      />,
    )

    // Each row should have an expand button
    const expandButtons = screen.getAllByRole('button', { name: /expand/i })
    expect(expandButtons.length).toBeGreaterThan(0)

    await user.click(expandButtons[0]!)
    expect(screen.getByText(/Detail: Alice/)).toBeInTheDocument()
  })

  it('density compact applies compact class to cells', () => {
    const onStateChange = vi.fn()
    const { container } = render(
      <DataTable
        columns={columns}
        rows={rows}
        state={makeState({ density: 'compact' })}
        totalCount={2}
        onStateChange={onStateChange}
      />,
    )
    // compact density should apply py-1 class to cells
    const cells = container.querySelectorAll('[data-density="compact"]')
    expect(cells.length).toBeGreaterThan(0)
  })

  it('density comfortable applies comfortable class to cells', () => {
    const onStateChange = vi.fn()
    const { container } = render(
      <DataTable
        columns={columns}
        rows={rows}
        state={makeState({ density: 'comfortable' })}
        totalCount={2}
        onStateChange={onStateChange}
      />,
    )
    const cells = container.querySelectorAll('[data-density="comfortable"]')
    expect(cells.length).toBeGreaterThan(0)
  })

  it('column visibility toggle hides/shows column', async () => {
    const onStateChange = vi.fn()
    const { rerender } = render(
      <DataTable
        columns={columns}
        rows={rows}
        state={makeState({ columnVisibility: { age: false } })}
        totalCount={2}
        onStateChange={onStateChange}
      />,
    )
    // Age data cell should be hidden (no "25" or "30" under Age)
    expect(screen.queryByText('25')).not.toBeInTheDocument()

    // Show Age column via rerender
    rerender(
      <DataTable
        columns={columns}
        rows={rows}
        state={makeState({ columnVisibility: { age: true } })}
        totalCount={2}
        onStateChange={onStateChange}
      />,
    )
    // Age data cells should now be visible
    expect(screen.getByText('25')).toBeInTheDocument()
    expect(screen.getByText('30')).toBeInTheDocument()
  })

  it('empty state renders when no rows', () => {
    const onStateChange = vi.fn()
    render(
      <DataTable
        columns={columns}
        rows={[]}
        state={makeState()}
        totalCount={0}
        onStateChange={onStateChange}
      />,
    )
    expect(screen.getByText(/no results/i)).toBeInTheDocument()
  })

  it('loading state renders when isLoading', () => {
    const onStateChange = vi.fn()
    const { container } = render(
      <DataTable
        columns={columns}
        rows={[]}
        state={makeState()}
        totalCount={0}
        onStateChange={onStateChange}
        isLoading
      />,
    )
    expect(container.querySelector('[data-slot="data-table-loading"]')).toBeInTheDocument()
  })

  it('error state renders when error prop present', () => {
    const onStateChange = vi.fn()
    const onRetry = vi.fn()
    render(
      <DataTable
        columns={columns}
        rows={[]}
        state={makeState()}
        totalCount={0}
        onStateChange={onStateChange}
        error="Something went wrong"
        onRetry={onRetry}
      />,
    )
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    const retryBtn = screen.getByRole('button', { name: /retry/i })
    expect(retryBtn).toBeInTheDocument()
    fireEvent.click(retryBtn)
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('export button triggers onExport callback', async () => {
    const user = userEvent.setup()
    const onStateChange = vi.fn()
    const onExport = vi.fn()
    render(
      <DataTable
        columns={columns}
        rows={rows}
        state={makeState()}
        totalCount={2}
        onStateChange={onStateChange}
        onExport={onExport}
      />,
    )
    const exportBtn = screen.getByRole('button', { name: /export/i })
    await user.click(exportBtn)
    expect(onExport).toHaveBeenCalledOnce()
  })

  it('row selection checkbox works', () => {
    const onStateChange = vi.fn()
    render(
      <DataTable
        columns={columns}
        rows={rows}
        state={makeState()}
        totalCount={2}
        onStateChange={onStateChange}
      />,
    )
    // Native checkboxes for row selection
    const checkboxes = screen.getAllByRole('checkbox')
    // should have select-all + 2 row checkboxes = 3 total
    expect(checkboxes.length).toBeGreaterThanOrEqual(3)

    // Verify first row checkbox starts unchecked
    const firstRowCheckbox = checkboxes[1]! as HTMLInputElement
    expect(firstRowCheckbox).not.toBeChecked()

    // Click to select
    fireEvent.click(firstRowCheckbox)
    expect(firstRowCheckbox).toBeChecked()
  })
})
