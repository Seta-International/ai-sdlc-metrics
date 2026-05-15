import { SendHorizonal } from 'lucide-react'
import { type KeyboardEvent, useState } from 'react'
import { cn } from '../../lib/cn'

interface Props {
  onSubmit: (text: string) => void
  pending?: boolean
}

export function AgentInput({ onSubmit, pending }: Props) {
  const [value, setValue] = useState('')

  const submit = () => {
    if (!value.trim() || pending) return
    onSubmit(value)
    setValue('')
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div className="flex items-end gap-2 border-t border-hairline bg-canvas p-3">
      <textarea
        aria-label="Message agent"
        value={value}
        rows={1}
        disabled={pending}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        className={cn(
          'min-h-[36px] max-h-[96px] flex-1 resize-none rounded-md border border-hairline-strong bg-canvas px-3 py-2 text-[14px] text-ink',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-focus',
          'disabled:opacity-50',
        )}
      />
      <button
        type="button"
        onClick={submit}
        disabled={pending || !value.trim()}
        aria-label="Send message"
        className={cn(
          'inline-flex size-9 items-center justify-center rounded-md bg-primary text-on-primary',
          'hover:bg-primary-hover disabled:opacity-50',
        )}
      >
        <SendHorizonal className="size-4 stroke-[1.5]" />
      </button>
    </div>
  )
}
