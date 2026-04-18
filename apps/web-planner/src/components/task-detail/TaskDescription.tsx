'use client'

import { useRef } from 'react'
import { Textarea } from '@future/ui'
import { toast } from 'sonner'

interface Props {
  value: string
  onChange: (v: string) => void
}

export function TaskDescription({ value, onChange }: Props) {
  const sessionShownRef = useRef<boolean>(false)

  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const htmlPayload = e.clipboardData.getData('text/html')
    const plainText = e.clipboardData.getData('text/plain')

    const hasHtml = htmlPayload.includes('<') && !plainText.includes('<')

    if (hasHtml) {
      e.preventDefault()
      const target = e.currentTarget
      const { selectionStart, selectionEnd, value } = target
      const next = value.slice(0, selectionStart) + plainText + value.slice(selectionEnd)
      onChange(next)

      if (!sessionShownRef.current) {
        sessionShownRef.current = true
        toast('Rich text is not supported — formatting was removed.')
      }
    }
  }

  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      <h3 className="text-sm font-medium">Description</h3>
      <Textarea
        defaultValue={value}
        placeholder="Add a description…"
        rows={4}
        className="resize-none w-full"
        onBlur={(e) => onChange(e.target.value)}
        onPaste={handlePaste}
      />
    </div>
  )
}
