import type { FlowPolicyEntry } from '../../../agents/application/services/flow-policy-resolver'

export const syntheticPolicy: FlowPolicyEntry = {
  intent_slug: 'synthetic.test-intent',
  approvalFreshness: 'accept-stale',
}
