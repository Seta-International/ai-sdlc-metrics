'use client'

import { useState } from 'react'
import { Switch } from '@future/ui'
import { AdminPageHeader } from '@/components/admin-page-header'

interface ModulesPageProps {
  params: { tenantId: string }
}

interface ModuleConfig {
  key: string
  label: string
  description: string
  defaultEnabled: boolean
}

const MODULE_LIST: ModuleConfig[] = [
  {
    key: 'people',
    label: 'People',
    description: 'Employment profiles, org placements, offboarding',
    defaultEnabled: true,
  },
  {
    key: 'time',
    label: 'Time',
    description: 'Attendance, leave, OT, timesheets',
    defaultEnabled: false,
  },
  {
    key: 'hiring',
    label: 'Hiring',
    description: 'Recruitment, pipeline, interviews, offers',
    defaultEnabled: false,
  },
  {
    key: 'performance',
    label: 'Performance',
    description: 'Review cycles, evaluations, feedback',
    defaultEnabled: false,
  },
  {
    key: 'projects',
    label: 'Projects',
    description: 'Staffing, assignments, delivery',
    defaultEnabled: false,
  },
  {
    key: 'finance',
    label: 'Finance',
    description: 'Invoices, payroll, budget',
    defaultEnabled: false,
  },
  { key: 'goals', label: 'Goals', description: 'OKRs, KPIs, objectives', defaultEnabled: false },
  {
    key: 'planner',
    label: 'Planner',
    description: 'Task tracking, evidence capture',
    defaultEnabled: false,
  },
  {
    key: 'agents',
    label: 'Agents',
    description: 'Agent configs, sessions, messages, tools',
    defaultEnabled: false,
  },
]

export default function ModulesPage({ params: { tenantId: _tenantId } }: ModulesPageProps) {
  const [toggles, setToggles] = useState<Record<string, boolean>>(
    Object.fromEntries(MODULE_LIST.map((m) => [m.key, m.defaultEnabled])),
  )

  const handleToggle = (key: string, value: boolean) => {
    setToggles((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <main className="p-8">
      <AdminPageHeader
        title="Module Toggles"
        description="Enable or disable modules for this tenant. Changes take effect immediately."
      />

      <div className="mt-8 max-w-2xl">
        <div className="divide-y rounded-lg border">
          {MODULE_LIST.map((mod) => (
            <div key={mod.key} className="flex items-center justify-between px-4 py-4">
              <div>
                <p className="font-medium">{mod.label}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">{mod.description}</p>
              </div>
              <Switch
                checked={toggles[mod.key] ?? false}
                onCheckedChange={(value) => handleToggle(mod.key, value)}
                aria-label={`Toggle ${mod.label}`}
              />
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
