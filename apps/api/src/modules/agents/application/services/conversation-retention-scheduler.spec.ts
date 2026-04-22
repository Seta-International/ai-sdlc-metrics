/**
 * conversation-retention-scheduler.spec.ts — Plan 04 R-04.27
 *
 * Daily pg-boss worker that reads retention config per tenant and calls
 * ConversationRepository.archiveIdleConversations. Default: 90 days, 'archive'.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  ConversationRetentionScheduler,
  JOB_ARCHIVE_IDLE_CONVERSATIONS,
  type TenantListerLike,
  type RetentionConfigProviderLike,
} from './conversation-retention-scheduler'
import type { ConversationRepository } from '../../domain/repositories/conversation.repository'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePgBoss() {
  return {
    enqueue: vi.fn().mockResolvedValue('job-id'),
    registerWorker: vi.fn(),
    registerScheduledWorker: vi.fn(),
    schedule: vi.fn().mockResolvedValue(undefined),
  }
}

function makeConvRepo(): ConversationRepository {
  return {
    loadOrCreateActive: vi.fn(),
    loadById: vi.fn(),
    archive: vi.fn(),
    delete: vi.fn(),
    listGlobal: vi.fn(),
    listBySurface: vi.fn(),
    incrementSummaryFailureStreak: vi.fn(),
    resetSummaryFailureStreak: vi.fn(),
    setSummaryDisabled: vi.fn(),
    clearSummaryDisabled: vi.fn(),
    updateTitle: vi.fn(),
    touchLastUserTurn: vi.fn(),
    archiveIdleConversations: vi.fn().mockResolvedValue(0),
  }
}

function makeTenantLister(tenantIds: string[]): TenantListerLike {
  return { listActiveTenantIds: vi.fn().mockResolvedValue(tenantIds) }
}

function makeConfigProvider(config: {
  idleThresholdDays: number
  mode: 'archive' | 'hard_delete'
}): RetentionConfigProviderLike {
  return { getConfig: vi.fn().mockResolvedValue(config) }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ConversationRetentionScheduler', () => {
  let pgBoss: ReturnType<typeof makePgBoss>
  let convRepo: ConversationRepository
  let scheduler: ConversationRetentionScheduler

  beforeEach(() => {
    pgBoss = makePgBoss()
    convRepo = makeConvRepo()
  })

  // ── registerWorkers ─────────────────────────────────────────────────────────

  describe('registerWorkers', () => {
    it('schedules a daily cron for JOB_ARCHIVE_IDLE_CONVERSATIONS', async () => {
      scheduler = new ConversationRetentionScheduler(pgBoss, convRepo, makeTenantLister([]))
      await scheduler.registerWorkers()

      expect(pgBoss.schedule).toHaveBeenCalledWith(
        JOB_ARCHIVE_IDLE_CONVERSATIONS,
        expect.stringMatching(/\*/), // any cron expression
      )
    })

    it('registers a worker for JOB_ARCHIVE_IDLE_CONVERSATIONS', async () => {
      scheduler = new ConversationRetentionScheduler(pgBoss, convRepo, makeTenantLister([]))
      await scheduler.registerWorkers()

      expect(pgBoss.registerScheduledWorker).toHaveBeenCalledWith(
        JOB_ARCHIVE_IDLE_CONVERSATIONS,
        expect.any(Function),
      )
    })
  })

  // ── handleRetentionJob ──────────────────────────────────────────────────────

  describe('handleRetentionJob', () => {
    it('does nothing when tenantLister returns empty list', async () => {
      scheduler = new ConversationRetentionScheduler(pgBoss, convRepo, makeTenantLister([]))
      await scheduler.handleRetentionJob()

      expect(convRepo.archiveIdleConversations).not.toHaveBeenCalled()
    })

    it('calls archiveIdleConversations once per tenant', async () => {
      scheduler = new ConversationRetentionScheduler(
        pgBoss,
        convRepo,
        makeTenantLister(['tenant-1', 'tenant-2']),
      )
      await scheduler.handleRetentionJob()

      expect(convRepo.archiveIdleConversations).toHaveBeenCalledTimes(2)
    })

    it('uses default 90-day archive config when no config provider given', async () => {
      scheduler = new ConversationRetentionScheduler(
        pgBoss,
        convRepo,
        makeTenantLister(['tenant-1']),
      )
      await scheduler.handleRetentionJob()

      expect(convRepo.archiveIdleConversations).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        idleThresholdDays: 90,
        mode: 'archive',
      })
    })

    it('uses custom config from configProvider when provided', async () => {
      scheduler = new ConversationRetentionScheduler(
        pgBoss,
        convRepo,
        makeTenantLister(['tenant-1']),
        makeConfigProvider({ idleThresholdDays: 30, mode: 'hard_delete' }),
      )
      await scheduler.handleRetentionJob()

      expect(convRepo.archiveIdleConversations).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        idleThresholdDays: 30,
        mode: 'hard_delete',
      })
    })

    it('calls archiveIdleConversations with correct tenantId per tenant', async () => {
      scheduler = new ConversationRetentionScheduler(
        pgBoss,
        convRepo,
        makeTenantLister(['tenant-A', 'tenant-B']),
      )
      await scheduler.handleRetentionJob()

      const calls = (convRepo.archiveIdleConversations as ReturnType<typeof vi.fn>).mock.calls
      const tenantIds = calls.map((c) => c[0].tenantId)
      expect(tenantIds).toContain('tenant-A')
      expect(tenantIds).toContain('tenant-B')
    })
  })
})
