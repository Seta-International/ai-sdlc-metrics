'use client'
import * as React from 'react'
import {
  Card,
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@future/ui'
import type { EmailConfig } from '../../../lib/types-workflows'
import { trpc } from '../../../lib/trpc'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyTrpc = trpc as any

const patterns: Array<{
  value: EmailConfig['pattern']
  label: string
  preview: (g: string, f: string, d: string) => string
}> = [
  {
    value: 'given_family',
    label: 'given.family (e.g. an.nguyen)',
    preview: (g, f, d) => `${g.toLowerCase()}.${f.toLowerCase()}@${d}`,
  },
  {
    value: 'given_initial_family',
    label: 'g.family (e.g. a.nguyen)',
    preview: (g, f, d) => `${g[0]?.toLowerCase()}.${f.toLowerCase()}@${d}`,
  },
  {
    value: 'family_given',
    label: 'family.given (e.g. nguyen.an)',
    preview: (g, f, d) => `${f.toLowerCase()}.${g.toLowerCase()}@${d}`,
  },
  {
    value: 'given_dot_family',
    label: 'given_family (e.g. an_nguyen)',
    preview: (g, f, d) => `${g.toLowerCase()}_${f.toLowerCase()}@${d}`,
  },
]

export default function EmailConfigPage() {
  const [config, setConfig] = React.useState<EmailConfig>({
    domain: '',
    pattern: 'given_family',
    transliterationMode: 'ascii',
  })
  const [testGiven, setTestGiven] = React.useState('An')
  const [testFamily, setTestFamily] = React.useState('Nguyen')

  React.useEffect(() => {
    void (async () => {
      try {
        const result = await (anyTrpc.people.settings.emailConfig.get.query() as Promise<{
          config: EmailConfig
        }>)
        setConfig(result.config)
      } catch {
        // ignore fetch errors on mount
      }
    })()
  }, [])

  const patternInfo = patterns.find((p) => p.value === config.pattern)
  const previewEmail = patternInfo
    ? patternInfo.preview(
        testGiven || 'Given',
        testFamily || 'Family',
        config.domain || 'company.com',
      )
    : ''

  return (
    <div className="space-y-6 max-w-2xl">
      <h2 className="text-lg font-[510] text-[#f7f8f8]">Email Configuration</h2>

      <Card className="border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] p-6 space-y-4">
        <div className="space-y-1">
          <label className="text-xs font-[510] text-[#8a8f98]">Email Domain</label>
          <Input
            value={config.domain}
            onChange={(e) => setConfig({ ...config, domain: e.target.value })}
            placeholder="company.com"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-[510] text-[#8a8f98]">Email Pattern</label>
          <Select
            value={config.pattern}
            onValueChange={(v) => setConfig({ ...config, pattern: v as EmailConfig['pattern'] })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {patterns.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-[510] text-[#8a8f98]">Transliteration Mode</label>
          <Select
            value={config.transliterationMode}
            onValueChange={(v) =>
              setConfig({ ...config, transliterationMode: v as EmailConfig['transliterationMode'] })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ascii">ASCII (a-z only)</SelectItem>
              <SelectItem value="vietnamese_ascii">
                Vietnamese ASCII (preserve diacritics)
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {previewEmail && (
          <div className="rounded-md border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] px-4 py-3">
            <div className="text-xs text-[#8a8f98] mb-1">Preview</div>
            <div className="text-sm font-mono text-[#7170ff]">{previewEmail}</div>
          </div>
        )}

        <Button variant="default" size="sm">
          Save Configuration
        </Button>
      </Card>

      <Card className="border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] p-6 space-y-4">
        <h3 className="text-sm font-[590] text-[#f7f8f8]">Test Generator</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-[510] text-[#8a8f98]">Given Name</label>
            <Input value={testGiven} onChange={(e) => setTestGiven(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-[510] text-[#8a8f98]">Family Name</label>
            <Input value={testFamily} onChange={(e) => setTestFamily(e.target.value)} />
          </div>
        </div>
        <div className="rounded-md border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] px-4 py-3">
          <div className="text-xs text-[#8a8f98] mb-1">Generated Email</div>
          <div className="text-sm font-mono text-[#10b981]">{previewEmail}</div>
        </div>
      </Card>
    </div>
  )
}
