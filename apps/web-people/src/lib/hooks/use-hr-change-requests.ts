'use client'

import * as React from 'react'
import { trpc } from '../trpc'
import type { ChangeRequestRow } from '../types-workflows'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyTrpc = trpc as any

const FIELD_LABELS: Record<string, string> = {
  'person_profile.preferred_name': 'Preferred name',
  'person_profile.date_of_birth': 'Date of birth',
  'person_profile.full_name': 'Full name',
  'person_profile.nationality': 'Nationality',
  'person_profile.name_display_order': 'Name display order',
  'person_profile.photo_document_id': 'Profile photo',
  'employment_detail.personal_email': 'Personal email',
  'employment_detail.personal_phone': 'Personal phone',
  'employment_detail.office_location': 'Office location',
  'employment_detail.work_phone': 'Work phone',
  'employment.company_email': 'Company email',
}

function fieldLabel(path: string): string {
  return FIELD_LABELS[path] ?? path
}

function displayValue(value: unknown): string {
  if (value == null) return '—'
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)

  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export interface HrQueueStats {
  pending: number
  approvedToday: number
  rejectedToday: number
  oldestDays: number
}

export type HrFilter = 'all_pending' | 'recent'

export interface UseHrChangeRequestsResult {
  rows: ChangeRequestRow[]
  stats: HrQueueStats
  isLoading: boolean
  refetch: () => void
}

interface RawItem {
  id: string
  employmentId: string
  employeeName: string | null
  fieldPath: string
  oldValue: unknown
  newValue: unknown
  requestedBy: string
  effectiveDate: string | null
  status: string
  reviewedBy: string | null
  reviewedAt: string | null
  reviewNote: string | null
  batchId: string | null
  reason: string | null
  createdAt: Date | string
}

export function useHrChangeRequests(filter: HrFilter): UseHrChangeRequestsResult {
  const [rows, setRows] = React.useState<ChangeRequestRow[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [tick, setTick] = React.useState(0)

  const refetch = React.useCallback(() => {
    setTick((current) => current + 1)
  }, [])

  React.useEffect(() => {
    let cancelled = false
    setIsLoading(true)

    const status = filter === 'all_pending' ? 'pending' : undefined

    void anyTrpc.people.listProfileChangeRequests
      .query({ mode: 'queue', status, limit: 50, offset: 0 })
      .then((result: { items: RawItem[] } | null) => {
        if (cancelled) return

        const mapped = (result?.items ?? []).map(
          (item): ChangeRequestRow => ({
            id: item.batchId ?? item.id,
            employmentId: item.employmentId,
            employeeName: item.employeeName ?? 'Unknown',
            avatarUrl: null,
            fieldPath: item.fieldPath,
            fieldLabel: fieldLabel(item.fieldPath),
            oldValue: displayValue(item.oldValue),
            newValue: displayValue(item.newValue),
            requestedBy: item.requestedBy,
            requestedByName: item.employeeName ?? item.requestedBy,
            requestedAt:
              item.createdAt instanceof Date
                ? item.createdAt.toISOString()
                : String(item.createdAt),
            effectiveDate: item.effectiveDate ?? null,
            status: item.status as ChangeRequestRow['status'],
            reviewedBy: item.reviewedBy,
            reviewedByName: null,
            reviewedAt: item.reviewedAt,
            reviewNote: item.reviewNote,
            editPolicyLabel: 'HR approval',
          }),
        )

        setRows(mapped)
      })
      .catch(() => {
        if (!cancelled) setRows([])
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [filter, tick])

  const stats = React.useMemo<HrQueueStats>(() => {
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const pendingRows = rows.filter((row) => row.status === 'pending')
    const approvedToday = rows.filter(
      (row) =>
        row.status === 'approved' &&
        row.reviewedAt != null &&
        new Date(row.reviewedAt) >= todayStart,
    ).length
    const rejectedToday = rows.filter(
      (row) =>
        row.status === 'rejected' &&
        row.reviewedAt != null &&
        new Date(row.reviewedAt) >= todayStart,
    ).length

    let oldestDays = 0
    for (const row of pendingRows) {
      const days = Math.floor((Date.now() - new Date(row.requestedAt).getTime()) / 86_400_000)
      if (days > oldestDays) oldestDays = days
    }

    return {
      pending: pendingRows.length,
      approvedToday,
      rejectedToday,
      oldestDays,
    }
  }, [rows])

  return { rows, stats, isLoading, refetch }
}
