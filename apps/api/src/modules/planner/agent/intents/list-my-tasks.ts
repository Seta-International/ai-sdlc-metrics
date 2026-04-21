/**
 * planner.list-my-tasks — user wants to see their own tasks.
 */

import type { IntentDescriptor } from '../../../agents/declare'

export const listMyTasksIntent: IntentDescriptor = {
  slug: 'planner.list-my-tasks',
  domain: 'planner',
  description: 'User is asking about their own open tasks, upcoming work, or task details.',
}
