export class UpdatePersonalProfileCommand {
  constructor(
    readonly tenantId: string,
    readonly employmentId: string,
    readonly updatedBy: string,
    // PersonProfile fields
    readonly preferredName?: string | null,
    readonly dateOfBirth?: Date | null,
    readonly gender?: string | null,
    readonly nationality?: string | null,
    readonly maritalStatus?: string | null,
    readonly nameDisplayOrder?: 'family_first' | 'given_first',
    // EmploymentDetail — contact
    readonly personalEmail?: string | null,
    readonly personalPhone?: string | null,
    readonly permanentAddress?: Record<string, unknown> | null,
    readonly currentAddress?: Record<string, unknown> | null,
    // EmploymentDetail — ID documents
    readonly nationalId?: string | null,
    readonly nationalIdType?: string | null,
    readonly nationalIdIssuedDate?: Date | null,
    readonly nationalIdExpiryDate?: Date | null,
    readonly passportNumber?: string | null,
    readonly passportExpiryDate?: Date | null,
    // EmploymentDetail — bank details (canEditBank required)
    readonly bankAccountNumber?: string | null,
    readonly bankName?: string | null,
    readonly bankBranch?: string | null,
    readonly bankSwiftCode?: string | null,
    readonly bankAccountHolder?: string | null,
    // EmploymentDetail — emergency contacts
    readonly emergencyContacts?: Array<Record<string, unknown>> | null,
  ) {}
}
