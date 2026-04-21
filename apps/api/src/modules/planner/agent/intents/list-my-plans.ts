/**
 * planner.list-my-plans — user wants to see their own plans.
 */

import type { IntentDescriptor } from '../../../agents/declare'

export const listMyPlansIntent: IntentDescriptor = {
  slug: 'planner.list-my-plans',
  domain: 'planner',
  description: 'User is asking about their own plans, active work streams, or plan progress.',
}
