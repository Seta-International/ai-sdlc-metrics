/**
 * planner.list-evidence — user wants to see evidence they contributed.
 */

import type { IntentDescriptor } from '../../../agents/declare'

export const listEvidenceIntent: IntentDescriptor = {
  slug: 'planner.list-evidence',
  domain: 'planner',
  description:
    'User is asking about evidence they contributed, submissions tied to tasks, or artifact history.',
}
