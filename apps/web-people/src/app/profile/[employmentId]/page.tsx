'use client'

import { useParams } from 'next/navigation'
import { ProfilePage } from '../../../components/profile'

export default function EmployeeProfilePage() {
  const params = useParams()
  return <ProfilePage employmentId={params.employmentId as string} />
}
