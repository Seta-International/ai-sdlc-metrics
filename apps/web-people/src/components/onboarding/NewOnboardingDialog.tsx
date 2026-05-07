'use client'

import * as React from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Button,
  Spinner,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@future/ui'
import { trpc } from '../../lib/trpc'
import type { OnboardingTemplate } from '../../lib/types-workflows'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyTrpc = trpc as any

interface NewOnboardingDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function NewOnboardingDialog({ open, onOpenChange, onSuccess }: NewOnboardingDialogProps) {
  const [employmentId, setEmploymentId] = React.useState('')
  const [templateId, setTemplateId] = React.useState('')
  const [employeeError, setEmployeeError] = React.useState<string | null>(null)
  const [templateError, setTemplateError] = React.useState<string | null>(null)
  const [isPending, setIsPending] = React.useState(false)
  const [employments, setEmployments] = React.useState<Array<{ value: string; label: string }>>([])
  const [templates, setTemplates] = React.useState<OnboardingTemplate[]>([])

  React.useEffect(() => {
    if (!open) return
    void (async () => {
      // Promise.all is permitted here — these are HTTP calls, not single-client DB queries.
      const [dirResult, tmpls] = await Promise.all([
        anyTrpc.people.directory.list.query({
          resourceKey: 'people.directory',
          search: '',
          filters: [],
          sorting: [],
          pagination: { pageIndex: 0, pageSize: 200 },
        }) as Promise<{
          rows: Array<{ id: string; fullName: string }>
        }>,
        anyTrpc.people.listOnboardingTemplates.query({}) as Promise<OnboardingTemplate[]>,
      ])
      setEmployments(dirResult.rows.map((r) => ({ value: r.id, label: r.fullName })))
      setTemplates(tmpls)
      if (tmpls.length === 1) setTemplateId(tmpls[0]!.id)
    })()
  }, [open])

  async function handleSubmit() {
    setEmployeeError(null)
    setTemplateError(null)
    setIsPending(true)
    try {
      await anyTrpc.people.onboarding.startCase.mutate({
        employmentId,
        templateId: templateId || undefined,
      })
      onSuccess()
      toast.success('Onboarding started')
    } catch (err: unknown) {
      const code = (err as { data?: { code?: string } })?.data?.code
      if (code === 'ONBOARDING_CASE_ALREADY_EXISTS') {
        setEmployeeError('This employee already has an active onboarding case.')
      } else if (code === 'NO_ONBOARDING_TEMPLATE') {
        setTemplateError('No template found. Configure an onboarding template in Settings.')
      } else {
        toast.error('Something went wrong')
      }
    } finally {
      setIsPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New onboarding</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-sm font-510 text-fg-primary">Employee</label>
            <Select value={employmentId} onValueChange={setEmploymentId}>
              <SelectTrigger>
                <SelectValue placeholder="Select employee..." />
              </SelectTrigger>
              <SelectContent>
                {employments.map((e) => (
                  <SelectItem key={e.value} value={e.value}>
                    {e.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {employeeError && <p className="text-xs text-destructive">{employeeError}</p>}
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-510 text-fg-primary">Onboarding template</label>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger>
                <SelectValue placeholder="Select template..." />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {templateError && <p className="text-xs text-destructive">{templateError}</p>}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!employmentId || isPending}>
            {isPending && <Spinner className="size-4 mr-1.5" />}
            Start onboarding
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
