import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { type Column, DataTable } from './DataTable'

interface Row {
  id: string
  name: string
  count: number
}
const rows: Row[] = [
  { id: '1', name: 'B', count: 20 },
  { id: '2', name: 'A', count: 10 },
]
const cols: Column<Row>[] = [
  { key: 'name', header: 'Name', cell: (r) => r.name, sortable: true },
  { key: 'count', header: 'Count', cell: (r) => r.count, sortable: true, align: 'right' },
]

describe('DataTable', () => {
  it('renders rows and columns', () => {
    render(<DataTable rows={rows} columns={cols} rowKey={(r) => r.id} />)
    expect(screen.getByText('Name')).toBeInTheDocument()
    expect(screen.getByText('A')).toBeInTheDocument()
    expect(screen.getByText('20')).toBeInTheDocument()
  })

  it('sorts ascending and toggles to descending on second click', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    render(<DataTable rows={rows} columns={cols} rowKey={(r) => r.id} />)
    await user.click(screen.getByText('Name'))
    let cells = screen.getAllByRole('cell').filter((c) => /^[AB]$/.test(c.textContent ?? ''))
    expect(cells[0]).toHaveTextContent('A')
    await user.click(screen.getByText('Name'))
    cells = screen.getAllByRole('cell').filter((c) => /^[AB]$/.test(c.textContent ?? ''))
    expect(cells[0]).toHaveTextContent('B')
  })

  it('emits onRowClick', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const onRowClick = vi.fn()
    render(<DataTable rows={rows} columns={cols} rowKey={(r) => r.id} onRowClick={onRowClick} />)
    await user.click(screen.getByText('A'))
    expect(onRowClick).toHaveBeenCalledWith(rows[1])
  })

  it('renders empty slot when rows is empty', () => {
    render(<DataTable rows={[]} columns={cols} rowKey={(r) => r.id} empty={<div>no data</div>} />)
    expect(screen.getByText('no data')).toBeInTheDocument()
  })

  it('wraps in overflow-x auto container', () => {
    const { container } = render(<DataTable rows={rows} columns={cols} rowKey={(r) => r.id} />)
    expect(container.firstElementChild).toHaveClass('overflow-x-auto')
  })
})
