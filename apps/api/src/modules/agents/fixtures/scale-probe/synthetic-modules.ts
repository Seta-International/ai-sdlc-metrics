/**
 * synthetic-modules.ts — Plan 13 Task 7
 *
 * Synthetic registry of 12 sub-agents × 20 tools used by ScaleProbeRunner,
 * ExtensibilityInvariantAudit, and related CI probes.
 *
 * This file contains ONLY test fixture data — no production sub-agents appear here.
 */

// ─── Module keys ──────────────────────────────────────────────────────────────

export const SYNTHETIC_MODULE_KEYS = [
  'synthetic.hr-planner',
  'synthetic.leave-manager',
  'synthetic.payroll-processor',
  'synthetic.recruitment-tracker',
  'synthetic.performance-reviewer',
  'synthetic.project-allocator',
  'synthetic.goal-tracker',
  'synthetic.finance-analyst',
  'synthetic.onboarding-guide',
  'synthetic.offboarding-coordinator',
  'synthetic.compliance-checker',
  'synthetic.insights-reporter',
] as const

export type SyntheticModuleKey = (typeof SYNTHETIC_MODULE_KEYS)[number]

// ─── Tool suffixes (20 per sub-agent) ────────────────────────────────────────

export const TOOL_SUFFIXES = [
  'list',
  'get',
  'create',
  'update',
  'delete',
  'search',
  'export',
  'import',
  'validate',
  'approve',
  'reject',
  'archive',
  'restore',
  'bulk-update',
  'audit',
  'notify',
  'assign',
  'unassign',
  'schedule',
  'cancel',
] as const

// ─── Sub-agent shape ──────────────────────────────────────────────────────────

export interface SyntheticSubAgent {
  key: SyntheticModuleKey
  intentSlug: string
  tools: string[]
}

// ─── Fixture data ─────────────────────────────────────────────────────────────

export const SYNTHETIC_SUB_AGENTS: SyntheticSubAgent[] = SYNTHETIC_MODULE_KEYS.map((key) => ({
  key,
  // e.g. 'synthetic.hr-planner' → 'synthetic-module.hr-planner'
  intentSlug: key.replace('synthetic.', 'synthetic-module.'),
  // e.g. 'hr-planner-list', 'hr-planner-get', …
  tools: TOOL_SUFFIXES.map((suffix) => `${key.split('.')[1]}-${suffix}`),
}))

// ─── Probe config constants ───────────────────────────────────────────────────

export const SCALE_PROBE_CONFIG = {
  syntheticModuleCount: 12,
  toolsPerSubAgent: 20,
  totalTools: 240, // 12 × 20
} as const
