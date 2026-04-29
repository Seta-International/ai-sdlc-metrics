'use client'

import * as React from 'react'
import { Button, Input, Spinner, toast } from '@future/ui'
import { ProfileCard, KVRow } from '../cards/ProfileCard'
import { SideRail } from '../rail/SideRail'
import { trpc } from '../../../lib/trpc'
import type { EmployeeProfile } from '../../../lib/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyTrpc = trpc as any

interface TabOverviewProps {
  profile: EmployeeProfile
  employmentId: string
  canEditPersonal: boolean
  canEditBank: boolean
  canViewSalary: boolean
  isEditing: boolean
  onSaved: () => void
}

export function TabOverview({
  profile,
  employmentId,
  canEditPersonal,
  canEditBank: _canEditBank,
  canViewSalary,
  isEditing,
  onSaved,
}: TabOverviewProps) {
  const { personProfile, employment, currentJob, emergencyContacts } = profile

  const [aboutForm, setAboutForm] = React.useState({
    preferredName: personProfile.preferredName ?? '',
    dateOfBirth: personProfile.dateOfBirth ?? '',
    nationality: personProfile.nationality ?? '',
    nameDisplayOrder: personProfile.nameDisplayOrder,
  })

  const [contactForm, setContactForm] = React.useState({
    personalEmail: '',
    personalPhone: '',
  })

  React.useEffect(() => {
    setAboutForm({
      preferredName: personProfile.preferredName ?? '',
      dateOfBirth: personProfile.dateOfBirth ?? '',
      nationality: personProfile.nationality ?? '',
      nameDisplayOrder: personProfile.nameDisplayOrder,
    })
  }, [personProfile])

  const [isAboutPending, setIsAboutPending] = React.useState(false)
  const [isContactPending, setIsContactPending] = React.useState(false)

  async function saveAbout() {
    setIsAboutPending(true)
    try {
      await anyTrpc.people.updatePersonalProfile.mutate({
        employmentId,
        preferredName: aboutForm.preferredName || null,
        dateOfBirth: aboutForm.dateOfBirth || null,
        nationality: aboutForm.nationality || null,
        nameDisplayOrder: aboutForm.nameDisplayOrder,
      })
      toast.success('About section saved')
      onSaved()
    } catch {
      toast.error('Failed to save — please try again')
    } finally {
      setIsAboutPending(false)
    }
  }

  async function saveContact() {
    setIsContactPending(true)
    try {
      await anyTrpc.people.updatePersonalProfile.mutate({
        employmentId,
        personalEmail: contactForm.personalEmail || null,
        personalPhone: contactForm.personalPhone || null,
      })
      toast.success('Contact saved')
      onSaved()
    } catch {
      toast.error('Failed to save — please try again')
    } finally {
      setIsContactPending(false)
    }
  }

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
                  value={aboutForm.preferredName}
                  onChange={(e) => setAboutForm((f) => ({ ...f, preferredName: e.target.value }))}
                  placeholder="Preferred name"
                  className="h-7 text-xs"
                />
              </div>
              <div className="grid" style={{ gridTemplateColumns: '160px 1fr' }}>
                <span className="text-xs text-muted-foreground self-center">Date of birth</span>
                <Input
                  type="date"
                  value={aboutForm.dateOfBirth}
                  onChange={(e) => setAboutForm((f) => ({ ...f, dateOfBirth: e.target.value }))}
                  className="h-7 text-xs"
                />
              </div>
              <div className="grid" style={{ gridTemplateColumns: '160px 1fr' }}>
                <span className="text-xs text-muted-foreground self-center">Nationality</span>
                <Input
                  value={aboutForm.nationality}
                  onChange={(e) => setAboutForm((f) => ({ ...f, nationality: e.target.value }))}
                  placeholder="Nationality"
                  className="h-7 text-xs"
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() =>
                    setAboutForm({
                      preferredName: personProfile.preferredName ?? '',
                      dateOfBirth: personProfile.dateOfBirth ?? '',
                      nationality: personProfile.nationality ?? '',
                      nameDisplayOrder: personProfile.nameDisplayOrder,
                    })
                  }
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="h-7 px-2 text-xs gap-1"
                  disabled={isAboutPending}
                  onClick={saveAbout}
                >
                  {isAboutPending && <Spinner className="size-3" />}
                  Save
                </Button>
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

        {isEditing && canEditPersonal && (
          <ProfileCard title="Contact">
            <div className="space-y-2 py-1.5">
              <div className="grid" style={{ gridTemplateColumns: '160px 1fr' }}>
                <span className="text-xs text-muted-foreground self-center">Personal email</span>
                <Input
                  type="email"
                  value={contactForm.personalEmail}
                  onChange={(e) => setContactForm((f) => ({ ...f, personalEmail: e.target.value }))}
                  placeholder="personal@email.com"
                  className="h-7 text-xs"
                />
              </div>
              <div className="grid" style={{ gridTemplateColumns: '160px 1fr' }}>
                <span className="text-xs text-muted-foreground self-center">Personal phone</span>
                <Input
                  value={contactForm.personalPhone}
                  onChange={(e) => setContactForm((f) => ({ ...f, personalPhone: e.target.value }))}
                  placeholder="+84901234567"
                  className="h-7 text-xs"
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => setContactForm({ personalEmail: '', personalPhone: '' })}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="h-7 px-2 text-xs gap-1"
                  disabled={isContactPending}
                  onClick={saveContact}
                >
                  {isContactPending && <Spinner className="size-3" />}
                  Save
                </Button>
              </div>
            </div>
          </ProfileCard>
        )}

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
