/**
 * planner.get-plan-status — user is asking about plan status or progress.
 */

import type { IntentDescriptor } from '../../../agents/declare'

export const getPlanStatusIntent: IntentDescriptor = {
  slug: 'planner.get-plan-status',
  domain: 'planner',
  description:
    'User is asking about the current status, progress, or health of a specific plan or project.',
}
