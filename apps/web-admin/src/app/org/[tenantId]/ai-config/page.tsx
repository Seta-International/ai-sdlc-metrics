'use client'

import { useState } from 'react'
import { Badge, Button, Input, Label, Spinner } from '@future/ui'
import { AdminPageHeader } from '@/components/admin-page-header'

interface AiConfigPageProps {
  params: { tenantId: string }
}

const REASONING_MODELS = ['gpt-5.4', 'gpt-4o', 'gpt-4-turbo']
const CLASSIFICATION_MODELS = ['gpt-5.4-nano', 'gpt-4o-mini', 'gpt-3.5-turbo']
const EMBEDDING_MODELS = ['text-embedding-3-small', 'text-embedding-3-large']

export default function AiConfigPage({ params: { tenantId: _tenantId } }: AiConfigPageProps) {
  const [isRotating, setIsRotating] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null)

  const handleRotate = () => {
    setIsRotating(true)
    // Placeholder — mutation wired in full implementation
    setTimeout(() => setIsRotating(false), 1000)
  }

  const handleTest = () => {
    setIsTesting(true)
    // Placeholder — mutation wired in full implementation
    setTimeout(() => {
      setIsTesting(false)
      setTestResult('success')
    }, 1000)
  }

  return (
    <main className="p-8">
      <AdminPageHeader
        title="AI Configuration"
        description="Configure the OpenAI API key and model preferences for this tenant."
      />

      <div className="mt-8 space-y-8 max-w-2xl">
        {/* API Key section */}
        <section className="rounded-lg border p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold">API Key</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Stored in AWS Secrets Manager. Only the last 4 digits are shown.
              </p>
            </div>
            <Badge variant="subtle">OpenAI</Badge>
          </div>

          <div className="space-y-2">
            <Label htmlFor="api-key-display">Current key</Label>
            <p className="font-mono text-sm text-muted-foreground" id="api-key-display">
              ••••••••••••••••
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="api-key-input">New API Key</Label>
            <Input
              id="api-key-input"
              type="password"
              placeholder="sk-..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </div>

          <div className="flex gap-2">
            <Button onClick={handleRotate} disabled={isRotating || !apiKey} variant="default">
              {isRotating && <Spinner className="size-4" />}
              Rotate Key
            </Button>
            <Button onClick={handleTest} disabled={isTesting} variant="outline">
              {isTesting && <Spinner className="size-4" />}
              Test Connection
            </Button>
          </div>

          {testResult === 'success' && (
            <p className="text-sm text-green-600">Connection test passed.</p>
          )}
          {testResult === 'error' && (
            <p className="text-sm text-destructive">Connection test failed. Check your key.</p>
          )}
        </section>

        {/* Model selectors */}
        <section className="rounded-lg border p-6 space-y-4">
          <h2 className="font-semibold">Model Preferences</h2>

          <div className="space-y-2">
            <Label htmlFor="reasoning-model">Reasoning Model</Label>
            <select
              id="reasoning-model"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              defaultValue="gpt-5.4"
            >
              {REASONING_MODELS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="classification-model">Classification Model</Label>
            <select
              id="classification-model"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              defaultValue="gpt-5.4-nano"
            >
              {CLASSIFICATION_MODELS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="embedding-model">Embedding Model</Label>
            <select
              id="embedding-model"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              defaultValue="text-embedding-3-small"
            >
              {EMBEDDING_MODELS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        </section>
      </div>
    </main>
  )
}
