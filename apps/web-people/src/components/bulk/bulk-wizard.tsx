'use client'
import * as React from 'react'
import {
  Card,
  Button,
  Progress,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Input,
} from '@future/ui'
import { Building2, Users, ToggleLeft, ArrowRight } from 'lucide-react'
import { BulkEmployeeSelector } from './bulk-employee-selector'
import { BulkPreviewTable } from './bulk-preview-table'
import type { BulkOperationType, BulkPreviewRow } from '../../lib/types-workflows'

type WizardStep = 'operation' | 'employees' | 'configure' | 'preview' | 'confirm'
const STEPS: WizardStep[] = ['operation', 'employees', 'configure', 'preview', 'confirm']

const operations: Array<{
  type: BulkOperationType
  title: string
  description: string
  icon: typeof Building2
}> = [
  {
    type: 'change_department',
    title: 'Change Department',
    description: 'Move selected employees to a new department',
    icon: Building2,
  },
  {
    type: 'change_manager',
    title: 'Change Manager',
    description: 'Assign a new manager to selected employees',
    icon: Users,
  },
  {
    type: 'change_status',
    title: 'Change Status',
    description: 'Update employment status for selected employees',
    icon: ToggleLeft,
  },
]

export function BulkWizard() {
  const [step, setStep] = React.useState<WizardStep>('operation')
  const [operation, setOperation] = React.useState<BulkOperationType | null>(null)
  const [selectedIds, setSelectedIds] = React.useState<string[]>([])
  const [config, setConfig] = React.useState<Record<string, string>>({})
  const [preview] = React.useState<BulkPreviewRow[]>([])
  const [isProcessing, setIsProcessing] = React.useState(false)
  const [progress] = React.useState(0)

  function navigateStep(direction: 'next' | 'back') {
    const idx = STEPS.indexOf(step)
    if (direction === 'next' && idx < STEPS.length - 1) setStep(STEPS[idx + 1]!)
    if (direction === 'back' && idx > 0) setStep(STEPS[idx - 1]!)
  }

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => (
          <React.Fragment key={s}>
            <div
              className={`flex items-center gap-1 text-xs font-[510] ${step === s ? 'text-[#7170ff]' : i < STEPS.indexOf(step) ? 'text-[#10b981]' : 'text-[#62666d]'}`}
            >
              <div
                className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] ${step === s ? 'bg-[#5e6ad2] text-white' : i < STEPS.indexOf(step) ? 'bg-[#10b981]/20 text-[#10b981]' : 'bg-[rgba(255,255,255,0.05)] text-[#62666d]'}`}
              >
                {i + 1}
              </div>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </div>
            {i < 4 && <div className="h-px w-8 bg-[rgba(255,255,255,0.08)]" />}
          </React.Fragment>
        ))}
      </div>

      {/* Step 1: Select operation */}
      {step === 'operation' && (
        <div className="grid grid-cols-3 gap-4">
          {operations.map((op) => {
            const Icon = op.icon
            return (
              <Card
                key={op.type}
                className={`cursor-pointer border p-6 text-center transition-colors ${operation === op.type ? 'border-[#7170ff] bg-[rgba(113,112,255,0.04)]' : 'border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] hover:bg-[rgba(255,255,255,0.04)]'}`}
                onClick={() => setOperation(op.type)}
              >
                <Icon className="mx-auto h-8 w-8 text-[#8a8f98] mb-3" />
                <div className="text-sm font-[510] text-[#f7f8f8]">{op.title}</div>
                <div className="text-xs text-[#62666d] mt-1">{op.description}</div>
              </Card>
            )
          })}
        </div>
      )}

      {/* Step 2: Select employees */}
      {step === 'employees' && (
        <BulkEmployeeSelector selectedIds={selectedIds} onSelectionChange={setSelectedIds} />
      )}

      {/* Step 3: Configure */}
      {step === 'configure' && operation && (
        <Card className="border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] p-6 max-w-md">
          <h3 className="text-sm font-[590] text-[#f7f8f8] mb-4">
            Configure: {operations.find((o) => o.type === operation)?.title}
          </h3>
          {operation === 'change_department' && (
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-[510] text-[#8a8f98]">New Department</label>
                <Select onValueChange={(val) => setConfig({ ...config, departmentId: val })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select department..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="eng">Engineering</SelectItem>
                    <SelectItem value="hr">Human Resources</SelectItem>
                    <SelectItem value="sales">Sales</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-[510] text-[#8a8f98]">Effective Date</label>
                <Input
                  type="date"
                  onChange={(e) => setConfig({ ...config, effectiveDate: e.target.value })}
                />
              </div>
            </div>
          )}
          {operation === 'change_manager' && (
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-[510] text-[#8a8f98]">New Manager</label>
                <Input
                  placeholder="Search by name..."
                  onChange={(e) => setConfig({ ...config, managerId: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-[510] text-[#8a8f98]">Effective Date</label>
                <Input
                  type="date"
                  onChange={(e) => setConfig({ ...config, effectiveDate: e.target.value })}
                />
              </div>
            </div>
          )}
          {operation === 'change_status' && (
            <div className="space-y-1">
              <label className="text-xs font-[510] text-[#8a8f98]">New Status</label>
              <Select onValueChange={(val) => setConfig({ ...config, status: val })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select status..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                  <SelectItem value="on_leave">On Leave</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </Card>
      )}

      {/* Step 4: Preview */}
      {step === 'preview' && <BulkPreviewTable rows={preview} />}

      {/* Step 5: Confirm */}
      {step === 'confirm' && (
        <Card className="border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] p-8 text-center max-w-md mx-auto">
          {isProcessing ? (
            <div className="space-y-4">
              <h3 className="text-sm font-[590] text-[#f7f8f8]">Processing</h3>
              <Progress value={progress} className="h-2" />
              <p className="text-xs text-[#8a8f98]">{progress}% complete</p>
            </div>
          ) : (
            <div className="space-y-4">
              <h3 className="text-sm font-[590] text-[#f7f8f8]">Ready to Execute</h3>
              <p className="text-sm text-[#8a8f98]">
                {selectedIds.length} employees will be updated.
              </p>
              <Button variant="default" onClick={() => setIsProcessing(true)}>
                Execute Changes
              </Button>
            </div>
          )}
        </Card>
      )}

      {/* Navigation */}
      {!isProcessing && (
        <div className="flex justify-between">
          {step !== 'operation' && (
            <Button variant="outline" size="sm" onClick={() => navigateStep('back')}>
              Back
            </Button>
          )}
          {step !== 'confirm' && (
            <Button
              variant="default"
              size="sm"
              className="ml-auto gap-1"
              disabled={
                (step === 'operation' && !operation) ||
                (step === 'employees' && selectedIds.length === 0)
              }
              onClick={() => navigateStep('next')}
            >
              Continue
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
