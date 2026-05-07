/**
 * planner.list-at-risk-plans — user wants to see plans or projects at risk.
 */

import type { IntentDescriptor } from '../../../agents/declare'

export const listAtRiskPlansIntent: IntentDescriptor = {
  slug: 'planner.list-at-risk-plans',
  domain: 'planner',
  description:
    'User is asking which plans or projects are at risk of missing their deadline or are blocked.',
}
