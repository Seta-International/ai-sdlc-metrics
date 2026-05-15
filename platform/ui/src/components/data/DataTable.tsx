import { type ReactNode, useMemo, useState } from 'react'
import { cn } from '../../lib/cn'

export interface Column<T> {
  key: string
  header: ReactNode
  cell: (row: T) => ReactNode
  sortable?: boolean
  align?: 'left' | 'right' | 'center'
  compare?: (a: T, b: T) => number
}

interface Props<T> {
  rows: readonly T[]
  columns: readonly Column<T>[]
  rowKey: (row: T) => string
  onRowClick?: (row: T) => void
  selectedKey?: string
  empty?: ReactNode
  className?: string
}

type SortState = { key: string; dir: 'asc' | 'desc' } | null

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  onRowClick,
  selectedKey,
  empty,
  className,
}: Props<T>) {
  const [sort, setSort] = useState<SortState>(null)

  const sorted = useMemo(() => {
    if (!sort) return rows
    const col = columns.find((c) => c.key === sort.key)
    if (!col) return rows
    const cmp = col.compare ?? defaultCompare(col)
    const out = [...rows].sort(cmp)
    return sort.dir === 'asc' ? out : out.reverse()
  }, [rows, columns, sort])

  if (rows.length === 0 && empty) {
    return <div className="py-12">{empty}</div>
  }

  const toggleSort = (key: string, sortable: boolean | undefined) => {
    if (!sortable) return
    setSort((prev) =>
      prev?.key !== key ? { key, dir: 'asc' } : prev.dir === 'asc' ? { key, dir: 'desc' } : null,
    )
  }

  return (
    <div className={cn('overflow-x-auto rounded-lg border border-hairline bg-canvas', className)}>
      <table className="w-full border-collapse text-[14px]">
        <thead className="bg-canvas-soft">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                onClick={() => toggleSort(col.key, col.sortable)}
                // biome-ignore lint/a11y/useKeyWithClickEvents: table sort; keyboard activation TBD
                className={cn(
                  'sticky top-0 px-3.5 py-2.5 text-left text-[12px] font-medium text-ink-mute tnum',
                  col.align === 'right' && 'text-right',
                  col.align === 'center' && 'text-center',
                  col.sortable && 'cursor-pointer hover:text-ink',
                )}
              >
                {col.header}
                {sort?.key === col.key && (
                  <span className="ml-1">{sort.dir === 'asc' ? '↑' : '↓'}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => {
            const key = rowKey(row)
            const selected = key === selectedKey
            return (
              <tr
                key={key}
                onClick={() => onRowClick?.(row)}
                // biome-ignore lint/a11y/useKeyWithClickEvents: row activation; keyboard support TBD
                className={cn(
                  'border-t border-hairline transition-colors tnum',
                  onRowClick && 'cursor-pointer',
                  selected ? 'bg-primary-subtle' : 'hover:bg-canvas-subtle',
                )}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      'px-3.5 py-2.5 text-ink',
                      col.align === 'right' && 'text-right',
                      col.align === 'center' && 'text-center',
                    )}
                  >
                    {col.cell(row)}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function defaultCompare<T>(col: Column<T>): (a: T, b: T) => number {
  return (a, b) => {
    const va = String(col.cell(a) ?? '')
    const vb = String(col.cell(b) ?? '')
    const na = Number(va)
    const nb = Number(vb)
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb
    return va.localeCompare(vb)
  }
}
