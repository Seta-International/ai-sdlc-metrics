'use client'

import { useState } from 'react'
import { Alert, AlertDescription, Button, Input, Label } from '@future/ui'

export interface ConnectFormProps {
  onSubmit: (values: { tenantAdId: string; clientId: string; clientSecret: string }) => void
  isSubmitting: boolean
  error: string | null
}

export function ConnectForm({ onSubmit, isSubmitting, error }: ConnectFormProps) {
  const [tenantAdId, setTenantAdId] = useState('')
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit({
          tenantAdId: tenantAdId.trim(),
          clientId: clientId.trim(),
          clientSecret: clientSecret.trim(),
        })
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="tenantAdId">Tenant (directory) ID</Label>
        <Input
          id="tenantAdId"
          value={tenantAdId}
          onChange={(e) => setTenantAdId(e.target.value)}
          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          disabled={isSubmitting}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="clientId">Application (client) ID</Label>
        <Input
          id="clientId"
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          disabled={isSubmitting}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="clientSecret">Client secret</Label>
        <Input
          id="clientSecret"
          type="password"
          value={clientSecret}
          onChange={(e) => setClientSecret(e.target.value)}
          disabled={isSubmitting}
          required
        />
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Validating…' : 'Test & Save'}
      </Button>
    </form>
  )
}
