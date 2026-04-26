import type { IntentDescriptor } from '../../../agents/declare'

export const syntheticIntent: IntentDescriptor = {
  slug: 'synthetic.test-intent',
  domain: 'synthetic',
  description:
    'Synthetic intent for EI-10 acceptance testing — verifies new modules are linted automatically.',
}
