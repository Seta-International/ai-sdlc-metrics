'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useMutation, useQueryClient } from '@future/api-client'
import { useSession } from '@future/auth'
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Spinner,
  Textarea,
} from '@future/ui'
import { trpc } from '../../lib/trpc'
import { personalKeys } from '../../lib/query-keys'
import { ContainerPicker, type ContainerValue } from './container-picker'

export function NewPlanForm() {
  const router = useRouter()
  const session = useSession()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [container, setContainer] = useState<ContainerValue>({
    containerType: 'future_only',
    containerRef: null,
  })

  const queryClient = useQueryClient()

  const createMutation = useMutation({
    mutationFn: ({ planId, bucketId }: { planId: string; bucketId: string }) =>
      trpc.planner.plans.create.mutate({
        actorId: session!.actorId,
        tenantId: session!.tenantId,
        id: planId,
        bucketId,
        name: name.trim(),
        description: description.trim() || null,
        containerType: container.containerType,
        containerRef: container.containerRef,
      }),
    onSuccess: (_data, { planId }) => {
      queryClient.invalidateQueries({
        queryKey: personalKeys.listPlans(session?.actorId, session?.tenantId),
      })
      router.push(`/plans/${planId}/board`)
    },
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!session || !name.trim()) return
    const planId = crypto.randomUUID()
    const bucketId = crypto.randomUUID()
    createMutation.mutate({ planId, bucketId })
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) router.push('/plans')
      }}
    >
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>New plan</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="plan-name" className="mb-1.5">
              Name
            </Label>
            <Input
              id="plan-name"
              autoFocus
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My plan"
              maxLength={255}
              required
            />
          </div>
          <div>
            <Label htmlFor="plan-description" className="mb-1.5">
              Description <span className="text-fg-subtle">(optional)</span>
            </Label>
            <Textarea
              id="plan-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this plan for?"
              rows={3}
            />
          </div>
          <div>
            <Label className="mb-1.5">Container</Label>
            <ContainerPicker value={container} onChange={setContainer} />
          </div>
          {createMutation.isError && (
            <p className="text-status-text-danger text-sm">
              Failed to create plan. Please try again.
            </p>
          )}
          <DialogFooter className="flex items-center justify-end gap-3 pt-2">
            <Button variant="ghost" asChild>
              <Link href="/plans">Cancel</Link>
            </Button>
            <Button type="submit" disabled={createMutation.isPending || !name.trim()}>
              {createMutation.isPending && <Spinner className="size-4" />}
              {createMutation.isPending ? 'Creating…' : 'Create plan'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
