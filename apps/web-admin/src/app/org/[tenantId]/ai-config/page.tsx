'use client'

import { useState } from 'react'
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
} from '@future/ui'
import { AdminPageHeader } from '@/components/admin-page-header'
import { trpc } from '@/lib/trpc'

interface AiConfigPageProps {
  params: { tenantId: string }
}

const REASONING_MODELS = ['gpt-5.4', 'gpt-4o', 'gpt-4-turbo']
const CLASSIFICATION_MODELS = ['gpt-5.4-nano', 'gpt-4o-mini', 'gpt-3.5-turbo']
const EMBEDDING_MODELS = ['text-embedding-3-small', 'text-embedding-3-large']

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adminTrpc = trpc.admin as any

export default function AiConfigPage({ params: { tenantId } }: AiConfigPageProps) {
  const [isRotating, setIsRotating] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [mutationError, setMutationError] = useState<string | null>(null)
  const [reasoningModel, setReasoningModel] = useState('gpt-5.4')
  const [classificationModel, setClassificationModel] = useState('gpt-5.4-nano')
  const [embeddingModel, setEmbeddingModel] = useState('text-embedding-3-small')

  const handleRotate = async () => {
    setIsRotating(true)
    setMutationError(null)
    try {
      await adminTrpc.upsertAiProviderConfig.mutate({
        tenantId,
        rawApiKey: apiKey,
        providerType: 'openai' as const,
        defaultReasoningModel: reasoningModel,
        defaultClassificationModel: classificationModel,
        embeddingModel,
      })
      setApiKey('')
    } catch (e: unknown) {
      setMutationError(e instanceof Error ? e.message : 'Failed to save AI configuration')
    } finally {
      setIsRotating(false)
    }
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
          </div>

          {mutationError && (
            <Alert variant="destructive">
              <AlertDescription>{mutationError}</AlertDescription>
            </Alert>
          )}
        </section>

        {/* Model selectors */}
        <section className="rounded-lg border p-6 space-y-4">
          <h2 className="font-semibold">Model Preferences</h2>

          <div className="space-y-2">
            <Label htmlFor="reasoning-model">Reasoning Model</Label>
            <Select value={reasoningModel} onValueChange={setReasoningModel}>
              <SelectTrigger id="reasoning-model" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REASONING_MODELS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="classification-model">Classification Model</Label>
            <Select value={classificationModel} onValueChange={setClassificationModel}>
              <SelectTrigger id="classification-model" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CLASSIFICATION_MODELS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="embedding-model">Embedding Model</Label>
            <Select value={embeddingModel} onValueChange={setEmbeddingModel}>
              <SelectTrigger id="embedding-model" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EMBEDDING_MODELS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </section>
      </div>
    </main>
  )
}
