/**
 * unclassified — tenant-neutral fallback intent (R-02.29).
 *
 * This is the explicit "unclassified" bucket: the router emits this slug
 * when no other intent matches the user's utterance. It is the only intent
 * slug that is permitted to omit the `domain.name` format — it has no domain
 * prefix by design.
 *
 * Domain: 'agents' — owned by the agents module, which is the only safe home
 * for cross-cutting concerns that do not belong to any business domain.
 */

import type { IntentDescriptor } from '../declare'

export const unclassifiedIntent: IntentDescriptor = {
  slug: 'unclassified',
  domain: 'agents',
  description:
    'Fallback when no other intent applies; the router could not classify the utterance.',
}
