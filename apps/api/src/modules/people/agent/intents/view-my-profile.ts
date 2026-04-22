/**
 * people.view-my-profile — user wants to see their own employment profile.
 */

import type { IntentDescriptor } from '../../../agents/declare'

export const viewMyProfileIntent: IntentDescriptor = {
  slug: 'people.view-my-profile',
  domain: 'people',
  description: 'User is asking about their own employment profile, department, or org placement.',
}
