'use client'

import * as React from 'react'
import { Input } from '@future/ui'
import { ProfileCard, KVRow } from '../cards/ProfileCard'
import { SideRail } from '../rail/SideRail'
import type { EmployeeProfile } from '../../../lib/types'

interface TabOverviewProps {
  profile: EmployeeProfile
  employmentId: string
  canEditPersonal: boolean
  canEditBank: boolean
  canViewSalary: boolean
  isEditing: boolean
  dirtyFields: Map<string, { old: unknown; new: unknown }>
  onFieldChange: (fieldPath: string, oldValue: unknown, newValue: unknown) => void
  onSaved: () => void
}

export function TabOverview({
  profile,
  employmentId,
  canEditPersonal,
  canEditBank: _canEditBank,
  canViewSalary,
  isEditing,
  dirtyFields,
  onFieldChange,
  onSaved: _onSaved,
}: TabOverviewProps) {
  const { personProfile, employment, currentJob, emergencyContacts } = profile

  return (
    <div className="grid gap-8 p-8" style={{ gridTemplateColumns: '1fr 300px' }}>
      <div className="flex flex-col gap-5">
        <ProfileCard
          title="About"
          action={!isEditing && canEditPersonal ? { label: 'Edit', onClick: () => {} } : undefined}
        >
          {isEditing && canEditPersonal ? (
            <div className="space-y-2 py-1.5">
              <div className="grid" style={{ gridTemplateColumns: '160px 1fr' }}>
                <span className="text-xs text-muted-foreground self-center">Preferred name</span>
                <Input
                  aria-label="Preferred name"
                  value={
                    dirtyFields.has('person_profile.preferred_name')
                      ? String(dirtyFields.get('person_profile.preferred_name')!.new ?? '')
                      : (personProfile.preferredName ?? '')
                  }
                  onChange={(e) =>
                    onFieldChange(
                      'person_profile.preferred_name',
                      personProfile.preferredName,
                      e.target.value,
                    )
                  }
                  className="h-7 text-xs"
                />
              </div>
              <div className="grid" style={{ gridTemplateColumns: '160px 1fr' }}>
                <span className="text-xs text-muted-foreground self-center">Date of birth</span>
                <Input
                  aria-label="Date of birth"
                  type="date"
                  value={
                    dirtyFields.has('person_profile.date_of_birth')
                      ? String(dirtyFields.get('person_profile.date_of_birth')!.new ?? '')
                      : (personProfile.dateOfBirth ?? '')
                  }
                  onChange={(e) =>
                    onFieldChange(
                      'person_profile.date_of_birth',
                      personProfile.dateOfBirth,
                      e.target.value,
                    )
                  }
                  className="h-7 text-xs"
                />
              </div>
              <div className="grid" style={{ gridTemplateColumns: '160px 1fr' }}>
                <span className="text-xs text-muted-foreground self-center">Nationality</span>
                <Input
                  aria-label="Nationality"
                  value={
                    dirtyFields.has('person_profile.nationality')
                      ? String(dirtyFields.get('person_profile.nationality')!.new ?? '')
                      : (personProfile.nationality ?? '')
                  }
                  onChange={(e) =>
                    onFieldChange(
                      'person_profile.nationality',
                      personProfile.nationality,
                      e.target.value,
                    )
                  }
                  className="h-7 text-xs"
                />
              </div>
            </div>
          ) : (
            <>
              <KVRow label="Preferred name" value={personProfile.preferredName} />
              <KVRow label="Start date" value={employment.hireDate} />
              <KVRow label="Employee ID" value={employment.employeeCode} mono />
            </>
          )}
        </ProfileCard>

        <ProfileCard title="Job">
          <KVRow label="Job title" value={currentJob?.jobTitle ?? null} />
          <KVRow label="Level" value={currentJob?.jobLevel ?? null} mono />
          <KVRow label="Department" value={currentJob?.departmentName ?? null} />
          <KVRow label="Employment type" value={employment.employmentType} />
          <KVRow label="Work arrangement" value={employment.workArrangement} />
        </ProfileCard>

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

        <ProfileCard title="Contact">
          {isEditing && canEditPersonal ? (
            <div className="space-y-2 py-1.5">
              <div className="grid" style={{ gridTemplateColumns: '160px 1fr' }}>
                <span className="text-xs text-muted-foreground self-center">Personal email</span>
                <Input
                  aria-label="Personal email"
                  type="email"
                  value={
                    dirtyFields.has('employment_detail.personal_email')
                      ? String(dirtyFields.get('employment_detail.personal_email')!.new ?? '')
                      : ''
                  }
                  onChange={(e) =>
                    onFieldChange('employment_detail.personal_email', null, e.target.value)
                  }
                  className="h-7 text-xs"
                />
              </div>
              <div className="grid" style={{ gridTemplateColumns: '160px 1fr' }}>
                <span className="text-xs text-muted-foreground self-center">Personal phone</span>
                <Input
                  aria-label="Personal phone"
                  value={
                    dirtyFields.has('employment_detail.personal_phone')
                      ? String(dirtyFields.get('employment_detail.personal_phone')!.new ?? '')
                      : ''
                  }
                  onChange={(e) =>
                    onFieldChange('employment_detail.personal_phone', null, e.target.value)
                  }
                  className="h-7 text-xs"
                />
              </div>
            </div>
          ) : (
            <>
              <KVRow label="Personal email" value={null} />
              <KVRow label="Personal phone" value={null} />
            </>
          )}
        </ProfileCard>

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

      <SideRail profile={profile} employmentId={employmentId} onViewAll={() => {}} />
    </div>
  )
}
