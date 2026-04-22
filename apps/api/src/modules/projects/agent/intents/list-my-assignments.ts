/**
 * projects.list-my-assignments — user wants to see projects they are staffed on.
 */

import type { IntentDescriptor } from '../../../agents/declare'

export const listMyAssignmentsIntent: IntentDescriptor = {
  slug: 'projects.list-my-assignments',
  domain: 'projects',
  description:
    'User is asking about projects they are staffed on, roles, or upcoming project deliveries.',
}
