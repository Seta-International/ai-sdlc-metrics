'use client'

import * as React from 'react'
import {
  Card,
  Button,
  Badge,
  FileUploadDropzone,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Progress,
} from '@future/ui'
import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'

type WizardStep = 'upload' | 'mapping' | 'validation' | 'preview' | 'processing'

interface ColumnMapping {
  sourceHeader: string
  targetField: string | null
  suggested: string | null
}

const STEPS: WizardStep[] = ['upload', 'mapping', 'validation', 'preview', 'processing']

export function ImportWizard() {
  const [step, setStep] = React.useState<WizardStep>('upload')
  const [file, setFile] = React.useState<File | null>(null)
  const [mappings, setMappings] = React.useState<ColumnMapping[]>([])
  const [validationResult] = React.useState<{
    valid: number
    errors: number
    warnings: number
    errorRows: Array<{ row: number; field: string; message: string; severity: 'error' | 'warning' }>
  } | null>(null)
  const [progress] = React.useState(0)

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => (
          <React.Fragment key={s}>
            <div
              className={`flex items-center gap-1 text-xs font-510 ${step === s ? 'text-accent' : i < STEPS.indexOf(step) ? 'text-emerald-500' : 'text-secondary-foreground/60'}`}
            >
              <div
                className={`flex h-6 w-6 items-center justify-center rounded-full text-tiny ${step === s ? 'bg-primary text-white' : i < STEPS.indexOf(step) ? 'bg-emerald-500/20 text-emerald-500' : 'bg-secondary/50 text-secondary-foreground/60'}`}
              >
                {i + 1}
              </div>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </div>
            {i < 4 && <div className="h-px w-8 bg-border" />}
          </React.Fragment>
        ))}
      </div>

      {step === 'upload' && (
        <Card className="border-border bg-card p-8">
          <div className="flex flex-col items-center gap-4">
            <FileUploadDropzone
              accept=".csv,.xlsx"
              description="Drop CSV or XLSX file here"
              hint="Maximum 10MB"
              className="w-full p-12"
              onFiles={(files) => {
                if (files[0]) setFile(files[0])
              }}
            />
            {file && (
              <div className="flex items-center justify-between w-full">
                <span className="text-sm text-secondary-foreground">
                  {file.name} ({(file.size / 1024).toFixed(0)} KB)
                </span>
                <Button variant="default" size="sm" onClick={() => setStep('mapping')}>
                  Continue
                </Button>
              </div>
            )}
          </div>
        </Card>
      )}

      {step === 'mapping' && (
        <Card className="border-border bg-card p-6">
          <h3 className="text-sm font-590 text-foreground mb-4">Column Mapping</h3>
          <p className="text-xs text-muted-foreground mb-4">
            Map detected headers to system fields.
          </p>
          <div className="space-y-2">
            {mappings.map((mapping, i) => (
              <div key={mapping.sourceHeader ?? i} className="flex items-center gap-4">
                <div className="w-48 text-sm text-secondary-foreground truncate">
                  {mapping.sourceHeader}
                </div>
                <span className="text-secondary-foreground/60">-&gt;</span>
                <Select
                  value={mapping.targetField ?? ''}
                  onValueChange={(val) => {
                    const next = [...mappings]
                    if (next[i]) {
                      next[i] = { ...next[i], targetField: val || null }
                    }
                    setMappings(next)
                  }}
                >
                  <SelectTrigger className="w-48 h-8">
                    <SelectValue placeholder="Select field..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Skip</SelectItem>
                    <SelectItem value="family_name">Family Name</SelectItem>
                    <SelectItem value="given_name">Given Name</SelectItem>
                    <SelectItem value="company_email">Company Email</SelectItem>
                    <SelectItem value="department">Department</SelectItem>
                    <SelectItem value="job_title">Job Title</SelectItem>
                    <SelectItem value="country_code">Country</SelectItem>
                    <SelectItem value="hire_date">Hire Date</SelectItem>
                  </SelectContent>
                </Select>
                {mapping.suggested && (
                  <Badge variant="subtle" className="text-tiny">
                    Suggested
                  </Badge>
                )}
              </div>
            ))}
          </div>
          <div className="mt-4 flex justify-between">
            <Button variant="outline" size="sm" onClick={() => setStep('upload')}>
              Back
            </Button>
            <Button variant="default" size="sm" onClick={() => setStep('validation')}>
              Validate
            </Button>
          </div>
        </Card>
      )}

      {step === 'validation' && validationResult && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <Card className="border-border bg-card p-4 text-center">
              <CheckCircle2 className="mx-auto h-5 w-5 text-emerald-500 mb-1" />
              <div className="text-lg font-510 text-emerald-500">{validationResult.valid}</div>
              <div className="text-xs text-muted-foreground">Valid</div>
            </Card>
            <Card className="border-border bg-card p-4 text-center">
              <XCircle className="mx-auto h-5 w-5 text-red-400 mb-1" />
              <div className="text-lg font-510 text-red-400">{validationResult.errors}</div>
              <div className="text-xs text-muted-foreground">Errors</div>
            </Card>
            <Card className="border-border bg-card p-4 text-center">
              <AlertTriangle className="mx-auto h-5 w-5 text-amber-400 mb-1" />
              <div className="text-lg font-510 text-amber-400">{validationResult.warnings}</div>
              <div className="text-xs text-muted-foreground">Warnings</div>
            </Card>
          </div>
          <div className="flex justify-between">
            <Button variant="outline" size="sm" onClick={() => setStep('mapping')}>
              Back
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => setStep('preview')}
              disabled={validationResult.errors > 0}
            >
              Preview
            </Button>
          </div>
        </div>
      )}

      {step === 'validation' && !validationResult && (
        <div className="text-sm text-muted-foreground py-8 text-center">
          <div className="mb-4">Validating file...</div>
          <div className="flex justify-between">
            <Button variant="outline" size="sm" onClick={() => setStep('mapping')}>
              Back
            </Button>
          </div>
        </div>
      )}

      {step === 'preview' && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Preview of changes — no data has been modified yet.
          </p>
          <div className="flex justify-between">
            <Button variant="outline" size="sm" onClick={() => setStep('validation')}>
              Back
            </Button>
            <Button variant="default" size="sm" onClick={() => setStep('processing')}>
              Import
            </Button>
          </div>
        </div>
      )}

      {step === 'processing' && (
        <Card className="border-border bg-card p-8 text-center">
          <h3 className="text-sm font-590 text-foreground mb-4">Processing Import</h3>
          <Progress value={progress} className="h-2 max-w-md mx-auto mb-4" />
          <p className="text-xs text-muted-foreground">{progress}% complete</p>
        </Card>
      )}
    </div>
  )
}
