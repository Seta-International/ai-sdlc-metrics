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

type PendingProps = {
  mode: 'pending'
  users: MsStagedUserRow[]
  onImport: (id: string) => void
  onSkip: (id: string) => void
  onBulkImport: (ids: string[]) => void
  onBulkSkip: (ids: string[]) => void
  isLoading: boolean
}

type SkippedProps = {
  mode: 'skipped'
  users: MsStagedUserRow[]
  onReset: (id: string) => void
  isLoading: boolean
}

type ImportedProps = {
  mode: 'imported'
  users: MsStagedUserRow[]
  onReset: (id: string) => void
  isLoading: boolean
}

type MsImportsTableProps = PendingProps | SkippedProps | ImportedProps

export function MsImportsTable(props: MsImportsTableProps) {
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set())

  function toggleAll() {
    if (selected.size === props.users.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(props.users.map((u) => u.id)))
    }
  }

  function toggleOne(id: string) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  const selectedIds = [...selected]
  const allSelected = props.users.length > 0 && selected.size === props.users.length
  const someSelected = selected.size > 0

  return (
    <div className="space-y-3">
      {props.mode === 'pending' && (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="default"
            disabled={!someSelected || props.isLoading}
            onClick={() => {
              props.onBulkImport(selectedIds)
              setSelected(new Set())
            }}
          >
            {props.isLoading && <Spinner className="mr-1 size-3.5" />}
            Import selected
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!someSelected || props.isLoading}
            onClick={() => {
              props.onBulkSkip(selectedIds)
              setSelected(new Set())
            }}
          >
            Skip selected
          </Button>
        </div>
      )}

      <div className="overflow-hidden rounded-md border border-border">
        <Table>
          <TableHeader className="bg-muted/30">
            <TableRow>
              {props.mode === 'pending' && (
                <TableHead className="w-8 px-3 py-2">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={toggleAll}
                    aria-label="Select all"
                  />
                </TableHead>
              )}
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
            {props.users.map((user) => (
              <TableRow key={user.id} className="border-t border-border hover:bg-muted/10">
                {props.mode === 'pending' && (
                  <TableCell className="px-3 py-2">
                    <Checkbox
                      checked={selected.has(user.id)}
                      onCheckedChange={() => toggleOne(user.id)}
                      aria-label={`Select ${user.displayName}`}
                    />
                  </TableCell>
                )}
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
                {props.mode === 'pending' && (
                  <TableCell className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        size="sm"
                        variant="default"
                        disabled={props.isLoading}
                        onClick={() => props.onImport(user.id)}
                      >
                        Import
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={props.isLoading}
                        onClick={() => props.onSkip(user.id)}
                      >
                        Skip
                      </Button>
                    </div>
                  </TableCell>
                )}
                {(props.mode === 'skipped' || props.mode === 'imported') && (
                  <TableCell className="px-3 py-2">
                    <div className="flex items-center justify-end">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={props.isLoading}
                        onClick={() => props.onReset(user.id)}
                      >
                        Reset to pending
                      </Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
            {props.users.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={props.mode === 'pending' ? 6 : 5}
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
