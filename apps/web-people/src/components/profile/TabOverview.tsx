'use client'

import { InfoCard } from './InfoCard'
import { FieldRenderer, FieldGroupRenderer } from '../FieldRenderer'
import type { EmployeeProfile } from '../../lib/types'

interface TabOverviewProps {
  profile: EmployeeProfile
  canEditPersonal: boolean
  canEditEmployment: boolean
  canEditBank: boolean
}

export function TabOverview({
  profile,
  canEditPersonal,
  canEditEmployment: _canEditEmployment,
  canEditBank,
}: TabOverviewProps) {
  const {
    personProfile,
    employment,
    currentJob,
    emergencyContacts,
    addresses,
    countryFields,
    customFields,
    bankDetails,
  } = profile

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <InfoCard title="Personal Information" editable={canEditPersonal}>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          <FieldRenderer label="Date of Birth" value={personProfile.dateOfBirth} type="date" />
          <FieldRenderer label="Gender" value={personProfile.gender} type="text" />
          <FieldRenderer label="Nationality" value={personProfile.nationality} type="text" />
          <FieldRenderer label="Marital Status" value={personProfile.maritalStatus} type="text" />
        </dl>
      </InfoCard>

      <InfoCard title="Employment Information">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          <FieldRenderer label="Employee Code" value={employment.employeeCode} type="text" />
          <FieldRenderer label="Company Email" value={employment.companyEmail} type="text" />
          <FieldRenderer label="Worker Type" value={employment.workerType} type="text" />
          <FieldRenderer label="Employment Type" value={employment.employmentType} type="text" />
          <FieldRenderer label="Work Arrangement" value={employment.workArrangement} type="text" />
          <FieldRenderer label="Hire Date" value={employment.hireDate} type="date" />
          <FieldRenderer label="Country" value={employment.countryCode} type="text" />
        </dl>
      </InfoCard>

      {currentJob && (
        <InfoCard title="Current Job">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <FieldRenderer label="Job Title" value={currentJob.jobTitle} type="text" />
            <FieldRenderer label="Job Level" value={currentJob.jobLevel} type="text" />
            <FieldRenderer label="Job Family" value={currentJob.jobFamilyName} type="text" />
            <FieldRenderer label="Department" value={currentJob.departmentName} type="text" />
            <FieldRenderer label="Location" value={currentJob.locationName} type="text" />
            <FieldRenderer label="Cost Center" value={currentJob.costCenter} type="text" />
            <FieldRenderer label="Manager" value={currentJob.managerName} type="text" />
            <FieldRenderer label="Effective Date" value={currentJob.effectiveDate} type="date" />
          </dl>
        </InfoCard>
      )}

      <InfoCard title="Emergency Contacts" editable={canEditPersonal}>
        {emergencyContacts.length === 0 ? (
          <p className="text-sm text-secondary-foreground/60">No emergency contacts added.</p>
        ) : (
          <div className="space-y-3">
            {emergencyContacts.map((contact) => (
              <div key={contact.id} className="rounded-md border border-sidebar-border p-3">
                <div className="text-sm font-510 text-foreground">{contact.name}</div>
                <div className="text-xs text-muted-foreground">{contact.relationship}</div>
                <div className="mt-1 text-xs text-secondary-foreground">{contact.phone}</div>
                {contact.email && (
                  <div className="text-xs text-secondary-foreground">{contact.email}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </InfoCard>

      <InfoCard title="Addresses" editable={canEditPersonal}>
        {addresses.length === 0 ? (
          <p className="text-sm text-secondary-foreground/60">No addresses added.</p>
        ) : (
          <div className="space-y-3">
            {addresses.map((addr) => (
              <div key={addr.id} className="rounded-md border border-sidebar-border p-3">
                <div className="text-xs font-510 text-muted-foreground uppercase mb-1">
                  {addr.type}
                </div>
                <div className="text-sm text-secondary-foreground">
                  {addr.line1}
                  {addr.line2 && <>, {addr.line2}</>}
                  <br />
                  {addr.city}
                  {addr.state && `, ${addr.state}`}
                  {addr.postalCode && ` ${addr.postalCode}`}
                  <br />
                  {addr.country}
                </div>
              </div>
            ))}
          </div>
        )}
      </InfoCard>

      {countryFields.length > 0 && (
        <InfoCard title="Country-Specific Information" editable={canEditPersonal}>
          <FieldGroupRenderer fields={countryFields} />
        </InfoCard>
      )}

      {customFields.length > 0 && (
        <InfoCard title="Custom Fields" editable={canEditPersonal}>
          <FieldGroupRenderer fields={customFields} />
        </InfoCard>
      )}

      {bankDetails && (
        <InfoCard title="Bank Details" editable={canEditBank}>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <FieldRenderer label="Account Number" value={bankDetails.accountNumber} type="text" />
            <FieldRenderer label="Bank Name" value={bankDetails.bankName} type="text" />
            <FieldRenderer label="Branch" value={bankDetails.branchName} type="text" />
            <FieldRenderer label="Account Holder" value={bankDetails.holderName} type="text" />
            <FieldRenderer label="SWIFT Code" value={bankDetails.swiftCode} type="text" />
          </dl>
        </InfoCard>
      )}
    </div>
  )
}
