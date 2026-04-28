'use client'

import * as React from 'react'
import Image from 'next/image'
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Spinner,
  TabsList,
  TabsTrigger,
  toast,
} from '@future/ui'
import {
  Edit,
  Share2,
  MoreHorizontal,
  Download,
  UserMinus,
  Mail,
  CalendarDays,
  RefreshCw,
} from '@future/ui/icons'
import { StatusBadge } from '../../StatusBadge'
import { RehireDialog } from './RehireDialog'
import type { EmployeeProfile } from '../../../lib/types'
import type { ProfilePermissions } from '../ProfilePage'
import { trpc } from '../../../lib/trpc'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyTrpc = trpc as any

interface ProfileHeroProps {
  profile: EmployeeProfile
  permissions: ProfilePermissions
  isEditing: boolean
  onEdit: () => void
  onDoneEditing: () => void
  onShare: () => void
  onStartOffboarding?: () => void
}

export function ProfileHero({
  profile,
  permissions,
  isEditing,
  onEdit,
  onDoneEditing,
  onShare,
  onStartOffboarding,
}: ProfileHeroProps) {
  const { personProfile, employment, currentJob } = profile
  const [showRehire, setShowRehire] = React.useState(false)
  const [isSyncing, setIsSyncing] = React.useState(false)
  const isTerminated = employment.employmentStatus === 'terminated'

  async function handleSyncFromMicrosoft() {
    if (isSyncing) return
    setIsSyncing(true)
    try {
      const result = await anyTrpc.people.syncFromMicrosoft.mutate({ employmentId: employment.id })
      if (result.updatedFields.length > 0) {
        toast.success(`Synced ${result.updatedFields.length} fields from Microsoft`)
      } else {
        toast.info('No changes — profile is already up to date')
      }
    } catch {
      toast.error('Sync failed — check Microsoft connection and try again')
    } finally {
      setIsSyncing(false)
    }
  }

  const initials = personProfile.fullName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  const joinedMonths = React.useMemo(() => {
    const ms = Date.now() - new Date(employment.hireDate).getTime()
    return Math.floor(ms / (1000 * 60 * 60 * 24 * 30))
  }, [employment.hireDate])

  return (
    <div className="border-b border-border">
      <div className="px-8 pt-6">
        {/* Action buttons — top right */}
        <div className="flex justify-end gap-2 mb-4">
          {permissions.canEdit &&
            (isEditing ? (
              <Button variant="default" size="sm" onClick={onDoneEditing} className="gap-1.5">
                Done editing
              </Button>
            ) : (
              <Button variant="default" size="sm" onClick={onEdit} className="gap-1.5">
                <Edit className="h-3.5 w-3.5" />
                Edit profile
              </Button>
            ))}
          {permissions.canSyncFromMicrosoft && (
            <Button
              variant="outline"
              size="sm"
              disabled={isSyncing}
              onClick={() => void handleSyncFromMicrosoft()}
              className="gap-1.5"
            >
              {isSyncing ? <Spinner className="size-3.5" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Sync from Microsoft
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onShare} className="gap-1.5">
            <Share2 className="h-3.5 w-3.5" />
            Share
          </Button>
          {permissions.canManage && (
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

        {/* Avatar + identity */}
        <div className="flex items-start gap-5">
          <div className="flex size-18 shrink-0 items-center justify-center rounded-full bg-secondary/50 text-xl font-510 text-secondary-foreground">
            {personProfile.photoUrl ? (
              <Image
                src={personProfile.photoUrl}
                alt={personProfile.fullName}
                width={72}
                height={72}
                className="h-full w-full rounded-full object-cover"
              />
            ) : (
              initials
            )}
          </div>

          <div className="flex-1 min-w-0">
            {/* Name + status */}
            <div className="flex items-center gap-2.5 mb-1">
              <h1 className="text-2xl font-510 tracking-tight text-foreground">
                {personProfile.fullName}
                {personProfile.preferredName && (
                  <span className="ml-2 text-lg font-normal text-muted-foreground">
                    ({personProfile.preferredName})
                  </span>
                )}
              </h1>
              <StatusBadge status={employment.employmentStatus} />
            </div>

            {/* Meta row: title · dept · location · level */}
            {currentJob && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
                <span className="text-secondary-foreground">{currentJob.jobTitle}</span>
                <span className="text-border">·</span>
                <span>{currentJob.departmentName}</span>
                {currentJob.locationName && (
                  <>
                    <span className="text-border">·</span>
                    <span>{currentJob.locationName}</span>
                  </>
                )}
                {currentJob.jobLevel && (
                  <>
                    <span className="text-border">·</span>
                    <span className="font-mono text-xs">{currentJob.jobLevel}</span>
                  </>
                )}
              </div>
            )}

            {/* Contact row */}
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              {employment.companyEmail && (
                <span className="flex items-center gap-1.5">
                  <Mail className="h-3 w-3" />
                  {employment.companyEmail}
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <CalendarDays className="h-3 w-3" />
                Joined {joinedMonths} months ago
              </span>
            </div>
          </div>
        </div>

        {/* Terminated banner */}
        {isTerminated && (
          <div className="mt-4 flex items-center gap-3 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-510 text-red-300">
                Employment ended{' '}
                {employment.terminationDate
                  ? new Date(employment.terminationDate).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })
                  : ''}
                {employment.terminationReason && ` · ${employment.terminationReason}`}
              </p>
              <p className="mt-0.5 text-xs text-red-400/75">
                Read-only. Record preserved for compliance.
                {employment.employeeCode && (
                  <>
                    {' '}
                    Previous profile: <code>{employment.employeeCode}</code>
                  </>
                )}
              </p>
            </div>
            <Button
              variant="default"
              size="sm"
              onClick={() => setShowRehire(true)}
              className="shrink-0"
            >
              Rehire
            </Button>
          </div>
        )}

        {showRehire && (
          <RehireDialog
            open={showRehire}
            onClose={() => setShowRehire(false)}
            employeeName={personProfile.fullName}
          />
        )}

        {/* Tab strip */}
        <TabsList className="mt-5 -mb-px h-auto rounded-none border-0 bg-transparent p-0 gap-0">
          {[
            { value: 'overview', label: 'Overview' },
            { value: 'job-history', label: 'Job history' },
            { value: 'documents', label: 'Documents' },
            { value: 'compensation', label: 'Compensation' },
            { value: 'changes', label: 'Change requests' },
            { value: 'activity', label: 'Activity' },
          ].map(({ value, label }) => (
            <TabsTrigger
              key={value}
              value={value}
              className="rounded-none border-b-2 border-transparent px-3 py-2 text-xs font-510 text-muted-foreground data-[state=active]:border-accent data-[state=active]:text-foreground data-[state=active]:shadow-none"
            >
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
    </div>
  )
}
