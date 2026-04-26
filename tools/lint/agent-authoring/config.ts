// config.ts — tunable constants for the agent-authoring lint rules.
// All thresholds and seed lists live here so rules stay logic-only.

export const lintConfig = {
  minWhenToUseChars: 80, // R-15.1 — lock at implementation PR review per plan §18
  actionVerbs: [
    // R-15.1 — domain-neutral seed set
    'ask',
    'asks',
    'list',
    'create',
    'update',
    'search',
    'compute',
    'approve',
    'reject',
    'schedule',
    'send',
    'fetch',
    'get',
    'find',
    'show',
    'display',
    'check',
    'validate',
    'calculate',
    'generate',
    'submit',
    'cancel',
    'assign',
    'remove',
    'add',
    'delete',
    'view',
    'browse',
    'retrieve',
  ],
  /** R-15.2 — must be lowercased for comparison */
  placeholderStrings: ['n/a', 'na', 'none', 'tbd', 'todo', 'fixme', ''],
  /** R-15.11 — minimum length of an override justification comment */
  minOverrideJustificationChars: 20,
  /** R-15.12 — rules overridden ≥ this many times per quarter surface for tuning */
  overrideAuditThreshold: 3,
  /** every R-15.x rule id → severity */
  severity: {
    'R-15.1': 'warning', // starts warning; flips to error at escalation date
    'R-15.2': 'warning',
    'R-15.3': 'warning',
    'R-15.4': 'warning',
    'R-15.5': 'error', // uniqueness violations are always errors
    'R-15.6': 'error',
    'R-15.7': 'error',
    'R-15.9': 'warning', // contradiction heuristic always warning
    'R-15.10': 'error', // new sub-agent without golden-trace is always error
    'R-15.11': 'error', // override without justification always error
  } as Record<string, 'error' | 'warning'>,
  /** config-only flip to error — two weeks from MVP ship */
  escalationDate: '2026-05-10',
}
