'use client'

import {
  Button,
  Badge,
  Alert,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@future/ui'
import { Edit, Share2, MoreHorizontal, Download, Clock, UserMinus } from 'lucide-react'
import { StatusBadge } from '../status-badge'
import { CompletenessBar } from '../completeness-bar'
import type { EmployeeProfile } from '../../lib/types'

interface ProfileHeaderProps {
  profile: EmployeeProfile
  canEdit: boolean
  canManage: boolean
  isSelf: boolean
  onEdit: () => void
  onShare: () => void
  onStartOffboarding?: () => void
}

export function ProfileHeader({
  profile,
  canEdit,
  canManage,
  isSelf,
  onEdit,
  onShare,
  onStartOffboarding,
}: ProfileHeaderProps) {
  const {
    personProfile,
    employment,
    currentJob,
    probation,
    completenessScore,
    completenessMissing,
  } = profile

  const initials = personProfile.fullName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <div className="space-y-4">
      {probation && probation.status === 'in_progress' && (
        <Alert className="border-amber-500/30 bg-amber-500/5">
          <Clock className="h-4 w-4 text-amber-400" />
          <div className="text-sm text-amber-200">
            Probation ends in{' '}
            {Math.ceil(
              (new Date(probation.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
            )}{' '}
            days
            <span className="ml-2 text-xs text-amber-300/60">
              ({new Date(probation.endDate).toLocaleDateString('en-GB')})
            </span>
          </div>
        </Alert>
      )}

      <div className="flex items-start gap-6">
        <div className="relative shrink-0">
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-[rgba(255,255,255,0.05)] text-2xl font-[510] text-[#d0d6e0]">
            {personProfile.photoUrl ? (
              <img
                src={personProfile.photoUrl}
                alt={personProfile.fullName}
                className="h-full w-full rounded-full object-cover"
              />
            ) : (
              initials
            )}
          </div>
          {(isSelf || canEdit) && (
            <button
              type="button"
              className="absolute bottom-0 right-0 flex h-7 w-7 items-center justify-center rounded-full border border-[rgba(255,255,255,0.08)] bg-[#191a1b] text-[#8a8f98] hover:text-[#f7f8f8]"
            >
              <Edit className="h-3 w-3" />
            </button>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-[510] tracking-[-0.288px] text-[#f7f8f8]">
                {personProfile.fullName}
                {personProfile.preferredName && (
                  <span className="ml-2 text-lg font-normal text-[#8a8f98]">
                    ({personProfile.preferredName})
                  </span>
                )}
              </h1>
              <div className="mt-1 flex items-center gap-2 flex-wrap">
                {currentJob && (
                  <>
                    <span className="text-sm text-[#d0d6e0]">{currentJob.jobTitle}</span>
                    <span className="text-[#62666d]">/</span>
                    <span className="text-sm text-[#8a8f98]">{currentJob.departmentName}</span>
                  </>
                )}
                {currentJob?.locationName && (
                  <>
                    <span className="text-[#62666d]">/</span>
                    <span className="text-sm text-[#8a8f98]">{currentJob.locationName}</span>
                  </>
                )}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <StatusBadge status={employment.employmentStatus} />
                {employment.workerType === 'contingent' && (
                  <Badge variant="subtle">Contingent</Badge>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {canEdit && (
                <Button variant="default" size="sm" onClick={onEdit} className="gap-1">
                  <Edit className="h-3.5 w-3.5" />
                  Edit Profile
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={onShare} className="gap-1">
                <Share2 className="h-3.5 w-3.5" />
                Share
              </Button>
              {canManage && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem>
                      <Download className="mr-2 h-3.5 w-3.5" />
                      Download PDF
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <Clock className="mr-2 h-3.5 w-3.5" />
                      View Job History
                    </DropdownMenuItem>
                    {onStartOffboarding && (
                      <DropdownMenuItem onClick={onStartOffboarding} className="text-red-400">
                        <UserMinus className="mr-2 h-3.5 w-3.5" />
                        Start Offboarding
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>

          <div className="mt-4 max-w-md">
            <CompletenessBar
              score={completenessScore}
              missingItems={completenessMissing}
              showLink={isSelf || canEdit}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
