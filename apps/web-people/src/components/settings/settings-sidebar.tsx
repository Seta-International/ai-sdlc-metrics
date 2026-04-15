'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Briefcase,
  UserPlus,
  UserMinus,
  Globe,
  Sliders,
  Shield,
  Eye,
  Mail,
  BarChart3,
  FileUp,
} from 'lucide-react'

const settingsLinks = [
  { href: '/settings/job-catalog', label: 'Job Catalog', icon: Briefcase },
  { href: '/settings/onboarding-templates', label: 'Onboarding Templates', icon: UserPlus },
  { href: '/settings/offboarding-templates', label: 'Offboarding Templates', icon: UserMinus },
  { href: '/settings/countries', label: 'Country Configuration', icon: Globe },
  { href: '/settings/custom-fields', label: 'Custom Fields', icon: Sliders },
  { href: '/settings/edit-policies', label: 'Edit Policies', icon: Shield },
  { href: '/settings/visibility', label: 'Field Visibility', icon: Eye },
  { href: '/settings/email', label: 'Email Configuration', icon: Mail },
  { href: '/settings/completeness', label: 'Completeness Rules', icon: BarChart3 },
  { href: '/settings/import', label: 'Import / Export', icon: FileUp },
]

export function SettingsSidebar() {
  const pathname = usePathname()
  return (
    <nav className="w-56 shrink-0 space-y-1">
      {settingsLinks.map((link) => {
        const isActive = pathname.startsWith(link.href)
        const Icon = link.icon
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${isActive ? 'bg-[rgba(255,255,255,0.08)] text-[#f7f8f8] font-[510]' : 'text-[#8a8f98] hover:bg-[rgba(255,255,255,0.04)] hover:text-[#d0d6e0]'}`}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {link.label}
          </Link>
        )
      })}
    </nav>
  )
}
