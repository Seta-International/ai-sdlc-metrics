export interface EmploymentDetail {
  id: string
  tenantId: string
  employmentId: string
  nationalId: string | null
  nationalIdType: string | null
  nationalIdIssuedDate: Date | null
  nationalIdExpiryDate: Date | null
  taxId: string | null
  socialInsuranceId: string | null
  passportNumber: string | null
  passportExpiryDate: Date | null
  bankAccountNumber: string | null
  bankName: string | null
  bankBranch: string | null
  bankAccountHolder: string | null
  bankSwiftCode: string | null
  personalEmail: string | null
  personalPhone: string | null
  permanentAddress: Record<string, unknown> | null
  currentAddress: Record<string, unknown> | null
  emergencyContacts: Array<Record<string, unknown>> | null
  countryData: Record<string, unknown> | null
  customFields: Record<string, unknown> | null
  officeLocation: string | null
  workPhone: string | null
  msJobTitle: string | null
  msDepartment: string | null
}
