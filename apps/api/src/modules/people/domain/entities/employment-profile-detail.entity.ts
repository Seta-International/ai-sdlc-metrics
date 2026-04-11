export interface EmploymentProfileDetail {
  profileId: string // identity — 1:1 with EmploymentProfile
  tenantId: string
  nationalId: string | null
  nationalIdIssuedDate: string | null // date stored as string (ISO date)
  nationalIdIssuedPlace: string | null
  oldNationalId: string | null
  oldNationalIdIssuedDate: string | null
  oldNationalIdIssuedPlace: string | null
  taxId: string | null
  socialInsuranceNumber: string | null
  bankAccountNumber: string | null
  bankName: string | null
  bankBranch: string | null
  dob: string | null // date stored as string (ISO date)
  gender: string | null
  maritalStatus: string | null
  permanentAddress: string | null
  currentAddress: string | null
  personalPhone: string | null
  personalEmail: string | null
  emergencyContactName: string | null
  emergencyContactPhone: string | null
  motorbikePlate: string | null
}
