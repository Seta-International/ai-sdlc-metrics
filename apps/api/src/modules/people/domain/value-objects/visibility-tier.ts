export type VisibilityTier = 'public' | 'restricted' | 'confidential'

export const VISIBILITY_TIER_VALUES: VisibilityTier[] = ['public', 'restricted', 'confidential']

/**
 * Returns the tiers a viewer is allowed to see.
 * Higher tiers include all lower tiers.
 */
export function getAllowedTiers(maxTier: VisibilityTier): VisibilityTier[] {
  switch (maxTier) {
    case 'confidential':
      return ['public', 'restricted', 'confidential']
    case 'restricted':
      return ['public', 'restricted']
    case 'public':
      return ['public']
  }
}
