'use client'

import { Label, RadioGroup, RadioGroupItem, Textarea } from '@future/ui'
import { useState } from 'react'
import { TinyBtn } from '../../primitives/tiny-btn'

export type RejectReason = 'not_needed' | 'wrong_entity' | 'wrong_value' | 'other_with_note'

const REASON_OPTIONS: Array<{ value: RejectReason; label: string }> = [
  { value: 'not_needed', label: 'not needed' },
  { value: 'wrong_entity', label: 'wrong entity' },
  { value: 'wrong_value', label: 'wrong value' },
  { value: 'other_with_note', label: 'other (with note)' },
]

export interface RejectReasonPickerProps {
  onConfirm: (input: { reason: RejectReason; note?: string }) => void | Promise<void>
  onCancel: () => void
}

export function RejectReasonPicker({ onConfirm, onCancel }: RejectReasonPickerProps) {
  const [reason, setReason] = useState<RejectReason>('not_needed')
  const [note, setNote] = useState('')

  const isNoteRequired = reason === 'other_with_note'
  const trimmedNote = note.trim()
  const canSubmit = !isNoteRequired || trimmedNote.length > 0

  return (
    <div className="flex w-full flex-col gap-2 rounded-md border border-white/[0.08] bg-white/[0.02] p-2">
      <div className="text-xs font-semibold text-foreground">Reject draft</div>

      <RadioGroup
        value={reason}
        onValueChange={(value) => setReason(value as RejectReason)}
        className="gap-1"
      >
        {REASON_OPTIONS.map((option) => (
          <Label
            key={option.value}
            htmlFor={`reject-reason-${option.value}`}
            className="gap-2 text-xs font-normal text-foreground/90"
          >
            <RadioGroupItem
              id={`reject-reason-${option.value}`}
              value={option.value}
              aria-label={option.label}
            />
            <span>{option.label}</span>
          </Label>
        ))}
      </RadioGroup>

      {isNoteRequired ? (
        <div className="flex flex-col gap-1">
          <Label htmlFor="reject-reason-note" className="text-xs font-normal text-muted-foreground">
            Note
          </Label>
          <Textarea
            id="reject-reason-note"
            aria-label="Note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={500}
            rows={3}
            className="min-h-20 px-2 py-1 text-xs"
          />
        </div>
      ) : null}

      <div className="flex justify-end gap-1.5">
        <TinyBtn onClick={onCancel}>Cancel</TinyBtn>
        <TinyBtn
          danger
          disabled={!canSubmit}
          onClick={() =>
            onConfirm({
              reason,
              ...(isNoteRequired ? { note: trimmedNote } : {}),
            })
          }
        >
          Reject draft
        </TinyBtn>
      </div>
    </div>
  )
}
