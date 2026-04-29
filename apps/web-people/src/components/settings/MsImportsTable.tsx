'use client'

import * as React from 'react'
import {
  Button,
  Checkbox,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@future/ui'

interface MsStagedUserRow {
  id: string
  displayName: string
  email: string | null
  jobTitle: string | null
  department: string | null
}

interface MsImportsTableProps {
  users: MsStagedUserRow[]
  onImport: (id: string) => void
  onSkip: (id: string) => void
  onBulkImport: (ids: string[]) => void
  onBulkSkip: (ids: string[]) => void
  isLoading: boolean
}

export function MsImportsTable({
  users,
  onImport,
  onSkip,
  onBulkImport,
  onBulkSkip,
  isLoading,
}: MsImportsTableProps) {
  const [selected, setSelected] = React.useState<Set<string>>(new Set())

  function toggleAll() {
    if (selected.size === users.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(users.map((u) => u.id)))
    }
  }

  function toggleOne(id: string) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  const selectedIds = [...selected]
  const allSelected = users.length > 0 && selected.size === users.length
  const someSelected = selected.size > 0

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="default"
          disabled={!someSelected || isLoading}
          onClick={() => {
            onBulkImport(selectedIds)
            setSelected(new Set())
          }}
        >
          {isLoading && <Spinner className="mr-1 size-3.5" />}
          Import selected
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!someSelected || isLoading}
          onClick={() => {
            onBulkSkip(selectedIds)
            setSelected(new Set())
          }}
        >
          Skip selected
        </Button>
      </div>

      <div className="overflow-hidden rounded-md border border-border">
        <Table>
          <TableHeader className="bg-muted/30">
            <TableRow>
              <TableHead className="w-8 px-3 py-2">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={toggleAll}
                  aria-label="Select all"
                />
              </TableHead>
              <TableHead className="px-3 py-2 text-left font-510 text-muted-foreground">
                Name
              </TableHead>
              <TableHead className="px-3 py-2 text-left font-510 text-muted-foreground">
                Email
              </TableHead>
              <TableHead className="px-3 py-2 text-left font-510 text-muted-foreground">
                Job Title
              </TableHead>
              <TableHead className="px-3 py-2 text-left font-510 text-muted-foreground">
                Dept
              </TableHead>
              <TableHead className="w-32 px-3 py-2" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id} className="border-t border-border hover:bg-muted/10">
                <TableCell className="px-3 py-2">
                  <Checkbox
                    checked={selected.has(user.id)}
                    onCheckedChange={() => toggleOne(user.id)}
                    aria-label={`Select ${user.displayName}`}
                  />
                </TableCell>
                <TableCell className="px-3 py-2 font-510">{user.displayName}</TableCell>
                <TableCell className="px-3 py-2 text-muted-foreground">
                  {user.email ?? '—'}
                </TableCell>
                <TableCell className="px-3 py-2 text-muted-foreground">
                  {user.jobTitle ?? '—'}
                </TableCell>
                <TableCell className="px-3 py-2 text-muted-foreground">
                  {user.department ?? '—'}
                </TableCell>
                <TableCell className="px-3 py-2">
                  <div className="flex items-center justify-end gap-1.5">
                    <Button
                      size="sm"
                      variant="default"
                      disabled={isLoading}
                      onClick={() => onImport(user.id)}
                    >
                      Import
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={isLoading}
                      onClick={() => onSkip(user.id)}
                    >
                      Skip
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {users.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="px-3 py-8 text-center text-sm text-muted-foreground"
                >
                  No users to show.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
