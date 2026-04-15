'use client'
import * as React from 'react'
import { Badge, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@future/ui'
import type { FieldPolicyEntry, FieldVisibilityEntry } from '../../lib/types-workflows'

type EditPolicyMode = 'self_service' | 'manager_approval' | 'hr_approval' | 'hr_only'
type VisibilityTier = 'public' | 'restricted' | 'confidential'

const editModeConfig: Record<
  EditPolicyMode,
  { label: string; variant: 'default' | 'subtle' | 'destructive' }
> = {
  self_service: { label: 'Self-service', variant: 'default' },
  manager_approval: { label: 'Manager Approval', variant: 'subtle' },
  hr_approval: { label: 'HR Approval', variant: 'subtle' },
  hr_only: { label: 'HR Only', variant: 'destructive' },
}

const tierConfig: Record<
  VisibilityTier,
  { label: string; variant: 'default' | 'subtle' | 'destructive' }
> = {
  public: { label: 'Public', variant: 'default' },
  restricted: { label: 'Restricted', variant: 'subtle' },
  confidential: { label: 'Confidential', variant: 'destructive' },
}

interface FieldPolicyListProps {
  mode: 'edit_policy' | 'visibility'
  entries: Array<FieldPolicyEntry | FieldVisibilityEntry>
  onChange: (fieldPath: string, value: string) => void
}

export function FieldPolicyList({ mode, entries, onChange }: FieldPolicyListProps) {
  const grouped = entries.reduce<Record<string, typeof entries>>((acc, entry) => {
    const section = entry.section || 'Other'
    if (!acc[section]) acc[section] = []
    acc[section].push(entry)
    return acc
  }, {})

  return (
    <div className="space-y-6">
      {Object.entries(grouped).map(([section, sectionEntries]) => (
        <div key={section}>
          <h3 className="text-sm font-[590] text-[#f7f8f8] mb-3 capitalize">{section}</h3>
          <div className="space-y-1">
            {sectionEntries.map((entry) => (
              <div
                key={entry.fieldPath}
                className="flex items-center justify-between rounded-md border border-[rgba(255,255,255,0.05)] px-3 py-2"
              >
                <div className="text-sm text-[#d0d6e0]">{entry.fieldLabel}</div>
                {mode === 'edit_policy' ? (
                  <Select
                    value={(entry as FieldPolicyEntry).editMode}
                    onValueChange={(val) => onChange(entry.fieldPath, val)}
                  >
                    <SelectTrigger className="w-48 h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(editModeConfig).map(([value, cfg]) => (
                        <SelectItem key={value} value={value}>
                          <Badge variant={cfg.variant} className="text-xs">
                            {cfg.label}
                          </Badge>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Select
                    value={(entry as FieldVisibilityEntry).tier}
                    onValueChange={(val) => onChange(entry.fieldPath, val)}
                  >
                    <SelectTrigger className="w-40 h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(tierConfig).map(([value, cfg]) => (
                        <SelectItem key={value} value={value}>
                          <Badge variant={cfg.variant} className="text-xs">
                            {cfg.label}
                          </Badge>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
