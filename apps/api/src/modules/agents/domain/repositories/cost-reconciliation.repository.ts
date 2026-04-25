/**
 * cost-reconciliation.repository.ts — Plan 13 Task 2
 *
 * Domain repository interface for weekly cost reconciliation between
 * internal cost events and vendor invoices.
 *
 * Note: NUMERIC columns are returned by pg as strings. All monetary/percentage
 * fields are typed as `string` to match the Drizzle/pg runtime behaviour.
 */

export interface CostReconciliationEntity {
  id: string
  /** ISO date string, e.g. '2026-04-20' for the week beginning Monday. */
  weekStart: string
  /** NUMERIC returned as string by pg. */
  agentCostEventSumUsd: string
  vendorInvoiceSumUsd: string
  divergencePct: string
  divergenceOverThreshold: boolean
  computedAt: Date
}

export interface CostReconciliationRepository {
  insert(rec: Omit<CostReconciliationEntity, 'id'>): Promise<CostReconciliationEntity>
  findByWeekStart(weekStart: string): Promise<CostReconciliationEntity | null>
  findRecent(opts?: { limit?: number }): Promise<CostReconciliationEntity[]>
}

export const COST_RECONCILIATION_REPOSITORY = Symbol('COST_RECONCILIATION_REPOSITORY')
