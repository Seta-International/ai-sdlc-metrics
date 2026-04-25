/**
 * Plan 13 — Production Readiness Validation Harness
 *
 * Criterion threshold configuration (R-13.15).
 * All threshold changes must go through a PR — no runtime mutation.
 */

export const CRITERION_THRESHOLDS = {
  // §18.1 Reliability
  '18.1.turn_completed_rate_30d': { threshold: '0.99', description: '≥99% turns complete' },
  '18.1.uncaught_error_rate_30d': { threshold: '0.01', description: '≤1% uncaught errors' },
  '18.1.provider_fallback_success_rate': {
    threshold: '0.95',
    description: '≥95% successful fallbacks',
  },
  '18.1.single_abort_path_compliance': {
    threshold: '0',
    description: 'zero abort bypass events',
  },
  '18.1.drafts_discarded_on_abort': {
    threshold: '0',
    description: 'zero drafts persisted on abort',
  },

  // §18.2 Security
  '18.2.cross_tenant_leak_suite': { threshold: 'pass', description: 'CI leak suite green' },
  '18.2.rls_unbypassable_at_domain_boundary': {
    threshold: 'pass',
    description: 'lint rule present + build green',
  },
  '18.2.identity_key_write_discipline_enforced': {
    threshold: '0',
    description: 'zero identity key writes attempted',
  },
  '18.2.taint_propagates_across_approval': {
    threshold: 'pass',
    description: 'E2E taint test green',
  },
  '18.2.kernel_audit_per_tool_call': { threshold: '0', description: 'zero audit join misses' },

  // §18.3 Cost (placeholders — Task 4 fills these)
  '18.3.per_turn_cost_p95_variance_week_over_week': {
    threshold: '0.1',
    description: '≤10% week-over-week variance',
  },
  '18.3.cache_hit_rate_hot_sessions': {
    threshold: '0.6',
    description: '≥60% cache hit on hot sessions',
  },
  '18.3.budget_refusal_precision': {
    threshold: '0.99',
    description: '≥99% budget refusal precision',
  },
  '18.3.adapter_dropped_cache_fields_count': {
    threshold: '0',
    description: 'zero adapter drops',
  },
  '18.3.tier_shift_user_notice_rate': {
    threshold: '1.0',
    description: '100% tier shifts noticed',
  },

  // §18.4 Observability
  '18.4.trace_correlation_end_to_end': {
    threshold: '1.0',
    description: '100% traces with joins intact',
  },
  '18.4.stratified_sampling_trigger_coverage': {
    threshold: '5',
    description: 'all 5 triggers fired ≥1×',
  },
  '18.4.canary_detects_planted_degradation': {
    threshold: 'pass',
    description: 'canary detects within 30 min',
  },
  '18.4.pii_redaction_at_capture': { threshold: '0', description: 'zero PII leakage in spans' },
  '18.4.replay_coverage_on_100_sampled': {
    threshold: '1.0',
    description: '100% replay success',
  },

  // §18.5 Rollout Safety
  '18.5.golden_trace_ci_gate_enabled': {
    threshold: 'pass',
    description: 'golden trace CI gate active',
  },
  '18.5.canary_1_5_25_100_automated': {
    threshold: 'pass',
    description: 'canary stages automated',
  },
  '18.5.shadow_mode_interface_exercised': {
    threshold: 'pass',
    description: '≥1 model-swap in shadow ≥7d',
  },
  '18.5.version_pinning_across_retries_compliance': {
    threshold: '1.0',
    description: '100% retries use pinned versions',
  },
  '18.5.intent_slug_coverage': {
    threshold: '0.02',
    description: '≤2% unclassified intent slugs',
  },
  '18.5.scale_probe.EI-4': {
    threshold: '0.95',
    description: '≥95% sub-agent retrieval recall',
  },
  '18.5.scale_probe.EI-5': { threshold: '0.95', description: '≥95% tool retrieval recall' },
  '18.5.scale_probe.EI-6': {
    threshold: 'pass',
    description: 'router prompt budget within ceiling',
  },
} as const

export type CriterionId = keyof typeof CRITERION_THRESHOLDS
