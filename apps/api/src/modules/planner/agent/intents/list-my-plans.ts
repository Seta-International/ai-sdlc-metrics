/**
 * planner.list-my-plans — user wants to see their own plans.
 */

import type { IntentDescriptor } from '../../../agents/declare'

export const listMyPlansIntent: IntentDescriptor = {
  slug: 'planner.list-my-plans',
  domain: 'planner',
  description:
    'User is asking about their own plan list, plan names, or high-level plan status — not individual tasks within a plan.',
}
