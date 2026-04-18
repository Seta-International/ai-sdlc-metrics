'use client'
import { useParams } from 'next/navigation'
import { CountryConfigTabs } from '../../../../components/settings/CountryConfigTabs'

export default function CountryConfigPage() {
  const params = useParams()
  const countryCode = params.countryCode as string
  return <CountryConfigTabs countryCode={countryCode} countryName={countryCode.toUpperCase()} />
}
