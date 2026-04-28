'use client'

import { ProfileCard, KVRow } from '../cards/ProfileCard'
import { SideRail } from '../rail/SideRail'
import type { EmployeeProfile } from '../../../lib/types'

interface TabOverviewProps {
  profile: EmployeeProfile
  employmentId: string
  canEditPersonal: boolean
  canViewSalary: boolean
}

export function TabOverview({
  profile,
  employmentId,
  canEditPersonal,
  canViewSalary,
}: TabOverviewProps) {
  const { personProfile, employment, currentJob, emergencyContacts } = profile

  return (
    <div className="grid grid-cols-[1fr_300px] gap-8 p-8">
      {/* Main column */}
      <div className="flex flex-col gap-5">
        {/* About */}
        <ProfileCard
          title="About"
          action={canEditPersonal ? { label: 'Edit', onClick: () => {} } : undefined}
        >
          <KVRow label="Preferred name" value={personProfile.preferredName} />
          <KVRow label="Start date" value={employment.hireDate} />
          <KVRow label="Employee ID" value={employment.employeeCode} mono />
        </ProfileCard>

        {/* Job */}
        <ProfileCard title="Job">
          <KVRow label="Job title" value={currentJob?.jobTitle ?? null} />
          <KVRow label="Level" value={currentJob?.jobLevel ?? null} mono />
          <KVRow label="Department" value={currentJob?.departmentName ?? null} />
          <KVRow label="Employment type" value={employment.employmentType} />
          <KVRow label="Work arrangement" value={employment.workArrangement} />
        </ProfileCard>

        {/* Compensation */}
        <ProfileCard title="Compensation" locked={!canViewSalary}>
          {!canViewSalary ? (
            <p className="py-1.5 text-xs text-muted-foreground">
              Restricted. You can view salary with{' '}
              <code className="font-mono text-secondary-foreground">people:salary:read</code>{' '}
              permission.
            </p>
          ) : (
            <p className="py-1.5 text-xs text-muted-foreground">Salary data loading…</p>
          )}
        </ProfileCard>

        {/* Emergency contacts */}
        <ProfileCard
          title="Emergency contacts"
          action={canEditPersonal ? { label: 'Add', onClick: () => {} } : undefined}
        >
          {emergencyContacts.length === 0 ? (
            <p className="py-1.5 text-xs text-muted-foreground">No emergency contacts added.</p>
          ) : (
            <div className="space-y-2 py-1">
              {emergencyContacts.map((contact, i) => (
                <div key={contact.id} className="flex items-center gap-2.5">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary/50 text-xs font-510 text-secondary-foreground">
                    {contact.name
                      .split(' ')
                      .map((n) => n[0])
                      .join('')
                      .slice(0, 2)
                      .toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-510 text-foreground">{contact.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {contact.relationship} · {contact.phone}
                    </p>
                  </div>
                  {i === 0 && (
                    <span className="rounded-sm border border-border px-1.5 py-0.5 text-xs text-muted-foreground">
                      Primary
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </ProfileCard>
      </div>

      {/* Side rail */}
      <SideRail profile={profile} employmentId={employmentId} onViewAll={() => {}} />
    </div>
  )
}
