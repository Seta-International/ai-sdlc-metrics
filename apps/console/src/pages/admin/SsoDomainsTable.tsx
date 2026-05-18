import { Button, Input, Label } from '@seta/ui'
import { X } from 'lucide-react'
import { useState } from 'react'

const DENYLIST = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'yahoo.com',
  'yahoo.co.uk',
  'ymail.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'proton.me',
  'protonmail.com',
  'aol.com',
  'gmx.com',
  'mail.com',
  'qq.com',
  '163.com',
])

export interface SsoDomainsTableProps {
  domains: string[]
  onChange: (next: string[]) => void | Promise<void>
}

export function SsoDomainsTable({ domains, onChange }: SsoDomainsTableProps) {
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function add() {
    setError(null)
    const d = draft.trim().toLowerCase().replace(/\.$/, '')
    if (!d) return
    if (DENYLIST.has(d)) {
      setError(`'${d}' is on the public-mail denylist — use a corporate domain`)
      return
    }
    if (domains.includes(d)) {
      setError(`'${d}' is already in the list`)
      return
    }
    setDraft('')
    await onChange([...domains, d])
  }

  async function remove(d: string) {
    await onChange(domains.filter((x) => x !== d))
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end gap-2">
        <div className="flex flex-1 flex-col gap-1">
          <Label htmlFor="domainInput">Add a domain</Label>
          <Input
            id="domainInput"
            value={draft}
            placeholder="Add a domain (e.g. acme.com)"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void add()
              }
            }}
          />
        </div>
        <Button type="button" variant="secondary" onClick={() => void add()}>
          Add
        </Button>
      </div>
      {error ? (
        <div
          role="alert"
          className="rounded-md border border-error/20 bg-error-soft px-3 py-2 text-[13px] text-error"
        >
          {error}
        </div>
      ) : null}
      <ul className="divide-y divide-hairline rounded-md border border-hairline">
        {domains.map((d) => (
          <li key={d} className="flex items-center justify-between px-3 py-2 text-[14px]">
            <span>{d}</span>
            <button
              type="button"
              aria-label={`Remove ${d}`}
              onClick={() => void remove(d)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-mute hover:bg-canvas-mute hover:text-ink"
            >
              <X className="h-4 w-4" />
            </button>
          </li>
        ))}
        {domains.length === 0 ? (
          <li className="px-3 py-2 text-[13px] text-ink-mute">No domains yet.</li>
        ) : null}
      </ul>
    </div>
  )
}
