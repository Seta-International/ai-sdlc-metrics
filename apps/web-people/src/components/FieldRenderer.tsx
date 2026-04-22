'use client'

import * as React from 'react'
import { Badge, Input, Textarea, Checkbox } from '@future/ui'

type FieldType = 'text' | 'number' | 'date' | 'boolean' | 'select' | 'multi_select' | 'textarea'

interface FieldRendererProps {
  label: string
  value: unknown
  type: FieldType
  editable?: boolean
  onChange?: (value: unknown) => void
}

export function FieldRenderer({
  label,
  value,
  type,
  editable = false,
  onChange,
}: FieldRendererProps) {
  if (!editable) {
    return (
      <div className="space-y-1">
        <dt className="text-xs font-510 text-muted-foreground uppercase tracking-wide">{label}</dt>
        <dd className="text-sm text-secondary-foreground">{renderReadOnlyValue(value, type)}</dd>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      <label className="text-xs font-510 text-muted-foreground uppercase tracking-wide">
        {label}
      </label>
      {renderEditableField(value, type, onChange)}
    </div>
  )
}

function renderReadOnlyValue(value: unknown, type: FieldType): React.ReactNode {
  if (value == null || value === '') return <span className="text-secondary-foreground/60">--</span>

  switch (type) {
    case 'boolean':
      return value ? 'Yes' : 'No'
    case 'date':
      return new Date(String(value)).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    case 'multi_select':
      return (
        <div className="flex flex-wrap gap-1">
          {(value as string[]).map((v) => (
            <Badge key={v} variant="subtle">
              {v}
            </Badge>
          ))}
        </div>
      )
    default:
      return String(value)
  }
}

function renderEditableField(
  value: unknown,
  type: FieldType,
  onChange?: (value: unknown) => void,
): React.ReactNode {
  switch (type) {
    case 'boolean':
      return (
        <Checkbox checked={Boolean(value)} onCheckedChange={(checked) => onChange?.(checked)} />
      )
    case 'textarea':
      return (
        <Textarea
          value={String(value ?? '')}
          onChange={(e) => onChange?.(e.target.value)}
          rows={3}
        />
      )
    default:
      return (
        <Input
          type={type === 'number' ? 'number' : type === 'date' ? 'date' : 'text'}
          value={String(value ?? '')}
          onChange={(e) => onChange?.(e.target.value)}
        />
      )
  }
}

// Grouped field renderer for country/custom field sections
interface FieldGroupRendererProps {
  fields: Array<{ fieldKey: string; label: string; group: string; type: string; value: unknown }>
  editable?: boolean
  onFieldChange?: (fieldKey: string, value: unknown) => void
}

export function FieldGroupRenderer({
  fields,
  editable = false,
  onFieldChange,
}: FieldGroupRendererProps) {
  const groups = fields.reduce<Record<string, typeof fields>>((acc, field) => {
    const group = field.group || 'Other'
    if (!acc[group]) acc[group] = []
    acc[group].push(field)
    return acc
  }, {})

  return (
    <div className="space-y-6">
      {Object.entries(groups).map(([groupName, groupFields]) => (
        <div key={groupName}>
          <h4 className="text-sm font-590 text-foreground mb-3">{groupName}</h4>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {groupFields.map((field) => (
              <FieldRenderer
                key={field.fieldKey}
                label={field.label}
                value={field.value}
                type={field.type as FieldType}
                editable={editable}
                onChange={onFieldChange ? (val) => onFieldChange(field.fieldKey, val) : undefined}
              />
            ))}
          </dl>
        </div>
      ))}
    </div>
  )
}
