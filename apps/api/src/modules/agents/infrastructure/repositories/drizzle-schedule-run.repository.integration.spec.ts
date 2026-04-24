/**
 * drizzle-schedule-run.repository.integration.spec.ts
 *
 * Integration tests for DrizzleScheduleRunRepository.
 *
 * Covers:
 *  1. insert(): persists all fields; returns row with generated id; endedAt and outcome are null
 *  2. getById(): returns run for matching tenantId; null for wrong tenantId (isolation)
 *  3. getByTraceId(): returns run matching traceId in tenant; null for wrong tenantId
 *  4. updateOutcome(): sets outcome, endedAt, and costSpentUsd
 *  5. listBySchedule(): returns runs in descending startedAt order; respects limit
 */

import { describe, it } from 'vitest'

describe('DrizzleScheduleRunRepository', () => {
  describe('insert()', () => {
    it.todo('persists all fields and returns a run with generated id')
    it.todo('startedAt defaults to now; endedAt and outcome are null')
    it.todo('stores pinnedVersions as jsonb')
    it.todo('stores pgBossJobId when provided; null when omitted')
  })

  describe('getById()', () => {
    it.todo('returns the run for the correct tenantId')
    it.todo('returns null for wrong tenantId (tenant isolation)')
    it.todo('returns null when runId does not exist')
  })

  describe('getByTraceId()', () => {
    it.todo('returns the run matching the traceId in the tenant')
    it.todo('returns null for wrong tenantId (tenant isolation)')
    it.todo('returns null when traceId does not exist')
  })

  describe('updateOutcome()', () => {
    it.todo('sets outcome and endedAt on the run')
    it.todo('sets costSpentUsd when provided')
    it.todo('does not modify costSpentUsd when omitted')
  })

  describe('listBySchedule()', () => {
    it.todo('returns runs in descending startedAt order')
    it.todo('respects the limit parameter')
    it.todo('defaults to 50 results when limit is not provided')
    it.todo('does not return runs from a different schedule')
  })
})
