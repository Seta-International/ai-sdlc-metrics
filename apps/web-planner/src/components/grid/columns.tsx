'use client'

import * as React from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import type { TaskFlat } from '@future/api-client/planner'
import { TitleCell } from './cells/TitleCell'
import { BucketCell } from './cells/BucketCell'
import { ProgressCell } from './cells/ProgressCell'
import { PriorityCell } from './cells/PriorityCell'
import { StartCell } from './cells/StartCell'
import { DueCell } from './cells/DueCell'
import { AssigneesCell } from './cells/AssigneesCell'
import { LabelsCell } from './cells/LabelsCell'
import { ActionsCell } from './cells/ActionsCell'

export type BuildColumnsOptions = {
  editable: boolean // consumed by cell components in Task 7 — cells render read-only when false
  onOpen: (taskId: string) => void
  planMembers: { actorId: string; displayName: string }[]
  planLabels: { id: string; name: string; color: string }[]
}

export function buildColumns(opts: BuildColumnsOptions): ColumnDef<TaskFlat>[] {
  const { onOpen } = opts

  return [
    // ── Select ──────────────────────────────────────────────────────────────
    {
      id: 'select',
      enableSorting: false,
      header: ({ table }) => (
        <input
          type="checkbox"
          checked={table.getIsAllPageRowsSelected()}
          ref={(el) => {
            if (el) {
              el.indeterminate = table.getIsSomePageRowsSelected()
            }
          }}
          onChange={(e) => table.toggleAllPageRowsSelected(e.target.checked)}
          aria-label="Select all"
          className="size-4 accent-primary"
        />
      ),
      cell: ({ row }) => (
        <input
          type="checkbox"
          checked={row.getIsSelected()}
          onChange={(e) => row.toggleSelected(e.target.checked)}
          aria-label="Select row"
          className="size-4 accent-primary"
        />
      ),
      size: 36,
    },

    // ── Title ───────────────────────────────────────────────────────────────
    {
      accessorKey: 'title',
      header: 'Title',
      enableSorting: true,
      cell: ({ row }) => <TitleCell task={row.original} onOpen={onOpen} />,
    },

    // ── Bucket ──────────────────────────────────────────────────────────────
    {
      accessorKey: 'bucket',
      id: 'bucket',
      enableSorting: false,
      header: 'Bucket',
      cell: ({ row }) => <BucketCell task={row.original} />,
    },

    // ── Progress ────────────────────────────────────────────────────────────
    {
      accessorKey: 'progress',
      header: 'Progress',
      enableSorting: true,
      cell: ({ row }) => <ProgressCell task={row.original} />,
    },

    // ── Priority ────────────────────────────────────────────────────────────
    {
      accessorKey: 'priority',
      header: 'Priority',
      enableSorting: true,
      cell: ({ row }) => <PriorityCell task={row.original} />,
    },

    // ── Start ───────────────────────────────────────────────────────────────
    {
      accessorKey: 'startDate',
      id: 'start',
      header: 'Start',
      enableSorting: false,
      cell: ({ row }) => <StartCell task={row.original} />,
    },

    // ── Due ─────────────────────────────────────────────────────────────────
    {
      accessorKey: 'dueDate',
      id: 'due',
      header: 'Due',
      enableSorting: true,
      cell: ({ row }) => <DueCell task={row.original} />,
    },

    // ── Assignees ───────────────────────────────────────────────────────────
    {
      accessorKey: 'assignees',
      header: 'Assignees',
      enableSorting: false,
      cell: ({ row }) => <AssigneesCell task={row.original} planMembers={opts.planMembers} />,
    },

    // ── Labels ──────────────────────────────────────────────────────────────
    {
      accessorKey: 'labels',
      header: 'Labels',
      enableSorting: false,
      cell: ({ row }) => <LabelsCell task={row.original} planLabels={opts.planLabels} />,
    },

    // ── Actions ─────────────────────────────────────────────────────────────
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      cell: ({ row }) => <ActionsCell task={row.original} onOpen={onOpen} />,
      size: 48,
    },
  ]
}
