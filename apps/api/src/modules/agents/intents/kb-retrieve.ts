import type { IntentDescriptor } from '../declare'

export const kbRetrieveIntent: IntentDescriptor = {
  slug: 'kb.retrieve',
  domain: 'agents',
  description:
    'User is asking a question answerable from the tenant knowledge base (policies, handbooks, FAQs, process guides).',
}
