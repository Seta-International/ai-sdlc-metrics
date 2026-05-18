import { Button, Input, Label, Switch } from '@seta/ui'
import { useState } from 'react'
import type { MailerDetail, MailerUpsertInput } from '../../api/mailer-admin'

export interface MailerConfigFormProps {
  detail?: MailerDetail
  onSave: (input: MailerUpsertInput) => void | Promise<void>
}

export function MailerConfigForm({ detail, onSave }: MailerConfigFormProps) {
  const [mailbox, setMailbox] = useState(detail?.config.mailbox_user_id ?? '')
  const [from, setFrom] = useState(detail?.config.from_address ?? '')
  const [enabled, setEnabled] = useState(detail?.enabled ?? true)
  const [pending, setPending] = useState(false)

  async function submit() {
    setPending(true)
    try {
      await onSave({
        provider: 'graph',
        config: { mailbox_user_id: mailbox, from_address: from },
        enabled,
      })
    } finally {
      setPending(false)
    }
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <div className="flex flex-col gap-1">
        <Label htmlFor="mailbox">Mailbox UPN / user id</Label>
        <Input
          id="mailbox"
          value={mailbox}
          onChange={(e) => setMailbox(e.target.value)}
          placeholder="no-reply@customer.com"
          required
        />
        <p className="text-[12px] text-ink-mute">
          Mailbox in the customer's M365 directory. The platform connector app must have
          admin-consented <code>Mail.Send</code>.
        </p>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="from">From address</Label>
        <Input
          id="from"
          type="email"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          required
        />
      </div>
      <div className="flex items-center gap-2">
        <Switch id="enabled" checked={enabled} onCheckedChange={setEnabled} />
        <Label htmlFor="enabled">Enabled</Label>
      </div>
      <div>
        <Button type="submit" variant="primary" disabled={pending}>
          Save
        </Button>
      </div>
    </form>
  )
}
