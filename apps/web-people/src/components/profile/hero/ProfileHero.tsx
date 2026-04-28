'use client'

import type { EmployeeProfile } from '../../../lib/types'
import type { ProfilePermissions } from '../ProfilePage'

interface ProfileHeroProps {
  profile: EmployeeProfile
  permissions: ProfilePermissions
  onEdit: () => void
  onShare: () => void
  onStartOffboarding?: () => void
}

export function ProfileHero(_props: ProfileHeroProps) {
  return null
}
