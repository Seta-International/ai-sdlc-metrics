'use client'

import { useState } from 'react'
import { Input, Button, Checkbox } from '@future/ui'
import { trpc } from '@/lib/trpc'

type CustomFieldValuePayload =
  | { text: string }
  | { number: number }
  | { date: string }
  | { yesNo: boolean }
  | { choice: string }

interface CustomField {
  defId: string
  name: string
  kind: 'text' | 'number' | 'date' | 'yes_no' | 'choice'
  choiceOptions: string[] | null
  position: number
  value: { text?: string; number?: number; date?: string; yesNo?: boolean; choice?: string } | null
}

interface Props {
  fields: CustomField[]
  taskId: string
  planId: string
  tenantId: string
  actorId: string
}

export function CustomFieldsSection({ fields, taskId, planId, tenantId, actorId }: Props) {
  if (fields.length === 0) return null

  return (
    <section aria-label="Custom fields" className="flex flex-col gap-3 px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Custom Fields
      </p>
      {fields.map((field) => (
        <CustomFieldRow
          key={field.defId}
          field={field}
          onSave={(value) =>
            trpc.planner.customFields.setValue.mutate({
              tenantId,
              planId,
              taskId,
              actorId,
              fieldDefId: field.defId,
              value: value as CustomFieldValuePayload,
            })
          }
        />
      ))}
    </section>
  )
}

function CustomFieldRow({ field, onSave }: { field: CustomField; onSave: (v: unknown) => void }) {
  const [localValue, setLocalValue] = useState(field.value)

  if (field.kind === 'yes_no') {
    const checked = localValue?.yesNo ?? false
    return (
      <div className="flex items-center gap-3">
        <label className="flex flex-1 cursor-pointer items-center gap-2 text-sm">
          <Checkbox
            data-testid={`cf-input-${field.defId}`}
            checked={checked}
            onCheckedChange={(val) => {
              const newVal = val === true
              setLocalValue({ yesNo: newVal })
              onSave({ yesNo: newVal })
            }}
          />
          {field.name}
        </label>
      </div>
    )
  }

  if (field.kind === 'choice' && field.choiceOptions) {
    const current = localValue?.choice ?? ''
    return (
      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">{field.name}</p>
        <div className="flex flex-wrap gap-1" role="group" aria-label={field.name}>
          {field.choiceOptions.map((opt) => (
            <Button
              key={opt}
              variant={current === opt ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                setLocalValue({ choice: opt })
                onSave({ choice: opt })
              }}
              data-testid={`cf-choice-${field.defId}-${opt}`}
            >
              {opt}
            </Button>
          ))}
        </div>
      </div>
    )
  }

  const inputType = field.kind === 'number' ? 'number' : field.kind === 'date' ? 'date' : 'text'
  const rawValue =
    field.kind === 'number'
      ? localValue?.number !== undefined
        ? String(localValue.number)
        : ''
      : field.kind === 'date'
        ? (localValue?.date ?? '')
        : (localValue?.text ?? '')

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={`cf-${field.defId}`} className="text-sm text-muted-foreground">
        {field.name}
      </label>
      <Input
        id={`cf-${field.defId}`}
        data-testid={`cf-input-${field.defId}`}
        type={inputType}
        defaultValue={rawValue}
        onBlur={(e) => {
          const raw = e.target.value
          if (field.kind === 'number') {
            const n = parseFloat(raw)
            if (!isNaN(n)) onSave({ number: n })
          } else if (field.kind === 'date') {
            onSave({ date: raw })
          } else {
            onSave({ text: raw })
          }
        }}
        className="h-8"
      />
    </div>
  )
}
