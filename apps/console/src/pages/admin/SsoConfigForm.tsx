import { Button, Input, Label, Switch } from '@seta/ui'
import { useState } from 'react'
import type { SsoConfigDetail, SsoUpsertInput } from '../../api/sso-admin'

export type SsoConfigFormSave = Omit<SsoUpsertInput, 'domains'>

export interface SsoConfigFormProps {
  detail?: SsoConfigDetail
  onSave: (input: SsoConfigFormSave) => void | Promise<void>
  onTest: () => void | Promise<void>
  redirectUri?: string
}

export function SsoConfigForm({ detail, onSave, onTest, redirectUri }: SsoConfigFormProps) {
  const [entraTenantId, setEntraTenantId] = useState(detail?.config.entra_tenant_id ?? '')
  const [clientId, setClientId] = useState(detail?.config.client_id ?? '')
  const [clientSecret, setClientSecret] = useState('')
  const [enabled, setEnabled] = useState(detail?.enabled ?? true)
  const [pending, setPending] = useState(false)

  async function submit() {
    setPending(true)
    try {
      const payload: SsoConfigFormSave = {
        provider: 'entra',
        config: { entra_tenant_id: entraTenantId, client_id: clientId },
        enabled,
        ...(clientSecret ? { clientSecret } : {}),
      }
      await onSave(payload)
      setClientSecret('')
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
        <Label htmlFor="entraTenantId">Entra tenant ID</Label>
        <Input
          id="entraTenantId"
          value={entraTenantId}
          onChange={(e) => setEntraTenantId(e.target.value)}
          placeholder="11111111-2222-3333-4444-555555555555 or contoso.onmicrosoft.com"
          required
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="clientId">Client ID</Label>
        <Input
          id="clientId"
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          required
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="clientSecret">Client secret</Label>
        <Input
          id="clientSecret"
          type="password"
          value={clientSecret}
          onChange={(e) => setClientSecret(e.target.value)}
          placeholder={detail?.hasSecret ? '••••••••' : 'paste from Azure portal'}
          autoComplete="new-password"
        />
        <p className="text-[12px] text-ink-mute">
          Write-only. Leave blank to keep the current secret. We never display the existing secret.
        </p>
      </div>
      {redirectUri ? (
        <div className="flex flex-col gap-1">
          <Label htmlFor="redirectUri">Redirect URI for the Azure app registration</Label>
          <Input id="redirectUri" value={redirectUri} readOnly />
          <p className="text-[12px] text-ink-mute">
            Copy this into Azure portal → Authentication → Redirect URIs.
          </p>
        </div>
      ) : null}
      <div className="flex items-center gap-2">
        <Switch id="enabled" checked={enabled} onCheckedChange={setEnabled} />
        <Label htmlFor="enabled">Enabled</Label>
      </div>
      <div className="flex items-center gap-2">
        <Button type="submit" variant="primary" disabled={pending}>
          Save
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => void onTest()}
          disabled={pending || !detail}
        >
          Test connection
        </Button>
      </div>
      {detail?.lastTestedAt ? (
        <p className="text-[12px] text-ink-mute">
          Last tested {detail.lastTestedAt} — {detail.lastTestResult ?? 'unknown'}
        </p>
      ) : null}
    </form>
  )
}
