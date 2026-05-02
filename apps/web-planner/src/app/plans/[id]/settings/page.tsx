'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@future/api-client'
import { UserPlusIcon, TrashIcon, XIcon, ArrowLeft } from '@future/ui/icons'
import { useSession } from '@future/auth'
import {
  Button,
  Input,
  Skeleton,
  Spinner,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@future/ui'
import { trpc } from '../../../../lib/trpc'
import { planKeys } from '../../../../lib/query-keys'
import { LabelEditor } from '../../../../components/LabelEditor'

interface PlanDetail {
  id: string
  name: string
  description: string
  updatedAt: string
  members: Array<{ actorId: string; role: 'owner' | 'editor' | 'viewer' }>
  labels: Array<{ slot: string; name: string; color: string }>
}

type Tab = 'details' | 'members' | 'labels'

export default function PlanSettingsPage() {
  const { id: planId } = useParams<{ id: string }>()
  const router = useRouter()
  const session = useSession()
  const queryClient = useQueryClient()

  const [activeTab, setActiveTab] = useState<Tab>('details')
  const [planName, setPlanName] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [newMemberActorId, setNewMemberActorId] = useState('')
  const [newMemberRole, setNewMemberRole] = useState<'owner' | 'editor' | 'viewer'>('editor')
  const [memberError, setMemberError] = useState<string | null>(null)
  const [mutationError, setMutationError] = useState<string | null>(null)

  const planQueryKey = planKeys.get(planId, session?.actorId, session?.tenantId)

  const { data: plan, isLoading } = useQuery({
    queryKey: planQueryKey,
    queryFn: () =>
      trpc.planner.plans.get
        .query({ actorId: session!.actorId, tenantId: session!.tenantId, planId })
        .then((data) => {
          const detail = data as unknown as PlanDetail | null
          if (detail) setPlanName(detail.name)
          return detail
        }),
    enabled: !!session && !!planId,
  })

  const renameMutation = useMutation({
    mutationFn: (name: string) =>
      trpc.planner.plans.rename.mutate({
        actorId: session!.actorId,
        tenantId: session!.tenantId,
        planId,
        name,
      }),
    onSuccess: (_data, name) => {
      queryClient.setQueryData<PlanDetail | null>(planQueryKey, (prev) =>
        prev ? { ...prev, name } : prev,
      )
      setNameError(null)
    },
    onError: () => setNameError('Failed to rename plan.'),
  })

  const deleteMutation = useMutation({
    mutationFn: () =>
      trpc.planner.plans.delete.mutate({
        actorId: session!.actorId,
        tenantId: session!.tenantId,
        planId,
      }),
    onSuccess: () => router.push('/plans'),
    onError: () => setDeleteError('Failed to delete plan. Please try again.'),
  })

  const addMemberMutation = useMutation({
    mutationFn: ({
      targetActorId,
      role,
    }: {
      targetActorId: string
      role: 'owner' | 'editor' | 'viewer'
    }) =>
      trpc.planner.plans.addMember.mutate({
        actorId: session!.actorId,
        tenantId: session!.tenantId,
        planId,
        targetActorId,
        role,
      }),
    onSuccess: (_data, { targetActorId, role }) => {
      queryClient.setQueryData<PlanDetail | null>(planQueryKey, (prev) =>
        prev
          ? {
              ...prev,
              members: [
                ...prev.members.filter((m) => m.actorId !== targetActorId),
                { actorId: targetActorId, role },
              ],
            }
          : prev,
      )
      setNewMemberActorId('')
      setMemberError(null)
    },
    onError: () => setMemberError('Failed to add member. Check the actor ID and try again.'),
  })

  const removeMemberMutation = useMutation({
    mutationFn: (targetActorId: string) =>
      trpc.planner.plans.removeMember.mutate({
        actorId: session!.actorId,
        tenantId: session!.tenantId,
        planId,
        targetActorId,
      }),
    onSuccess: (_data, targetActorId) => {
      queryClient.setQueryData<PlanDetail | null>(planQueryKey, (prev) =>
        prev ? { ...prev, members: prev.members.filter((m) => m.actorId !== targetActorId) } : prev,
      )
    },
    onError: () => setMutationError('Failed to remove member. Please try again.'),
  })

  const renameLabelMutation = useMutation({
    mutationFn: ({ slot, name }: { slot: string; name: string }) =>
      trpc.planner.labels.rename.mutate({
        actorId: session!.actorId,
        tenantId: session!.tenantId,
        planId,
        slot,
        name,
      }),
    onSuccess: (_data, { slot, name }) => {
      queryClient.setQueryData<PlanDetail | null>(planQueryKey, (prev) =>
        prev
          ? {
              ...prev,
              labels: [
                ...prev.labels.filter((l) => l.slot !== slot),
                {
                  slot,
                  name,
                  color:
                    prev.labels.find((l) => l.slot === slot)?.color ?? 'var(--color-fg-subtle)',
                },
              ],
            }
          : prev,
      )
    },
    onError: () => setMutationError('Failed to rename label. Please try again.'),
  })

  const recolorLabelMutation = useMutation({
    mutationFn: ({ slot, name, color }: { slot: string; name: string; color: string }) =>
      trpc.planner.labels.recolor.mutate({
        actorId: session!.actorId,
        tenantId: session!.tenantId,
        planId,
        slot,
        name,
        color,
      }),
    onSuccess: (_data, { slot, name, color }) => {
      queryClient.setQueryData<PlanDetail | null>(planQueryKey, (prev) =>
        prev
          ? {
              ...prev,
              labels: [...prev.labels.filter((l) => l.slot !== slot), { slot, name, color }],
            }
          : prev,
      )
    },
    onError: () => setMutationError('Failed to recolor label. Please try again.'),
  })

  function handleRenamePlan(e: React.FormEvent) {
    e.preventDefault()
    if (!session || !planName.trim() || !planId) return
    renameMutation.mutate(planName.trim())
  }

  function handleDeletePlan() {
    if (!session || !planId) return
    if (!confirm('Delete this plan? This cannot be undone.')) return
    deleteMutation.mutate()
  }

  function handleAddMember(e: React.FormEvent) {
    e.preventDefault()
    if (!session || !newMemberActorId.trim() || !planId) return
    addMemberMutation.mutate({ targetActorId: newMemberActorId.trim(), role: newMemberRole })
  }

  function handleRenameLabel(slot: string, name: string) {
    if (!session || !planId) return
    renameLabelMutation.mutate({ slot, name })
  }

  function handleRecolorLabel(slot: string, name: string, color: string) {
    if (!session || !planId) return
    recolorLabelMutation.mutate({ slot, name, color })
  }

  if (!session || isLoading) {
    return (
      <main className="p-8">
        <Skeleton className="h-6 w-48" />
      </main>
    )
  }

  if (!plan) {
    return (
      <main className="p-8">
        <p className="text-fg-muted text-sm">Plan not found.</p>
        <Button variant="ghost" size="sm" asChild className="mt-2">
          <Link href="/plans">
            <ArrowLeft className="size-4" />
            Back to plans
          </Link>
        </Button>
      </main>
    )
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'details', label: 'Details' },
    { key: 'members', label: 'Members' },
    { key: 'labels', label: 'Labels' },
  ]

  return (
    <main className="p-8 max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-normal tracking-h2 text-fg-primary">{plan.name} — Settings</h1>
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/plans/${planId}/board`}>
            <ArrowLeft className="size-4" />
            Board
          </Link>
        </Button>
      </div>

      <div className="flex gap-1 mb-6 border-b border-overlay/8">
        {tabs.map((tab) => (
          <Button
            key={tab.key}
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setActiveTab(tab.key)
              setMutationError(null)
            }}
            className={`px-4 py-2 border-b-2 -mb-px rounded-none ${
              activeTab === tab.key
                ? 'border-brand text-fg-primary'
                : 'border-transparent text-fg-muted hover:text-fg-secondary'
            }`}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      {activeTab === 'details' && (
        <div className="space-y-6">
          <form onSubmit={handleRenamePlan} className="space-y-3">
            <label className="block text-sm text-fg-muted" htmlFor="settings-plan-name">
              Name
            </label>
            <div className="flex gap-2">
              <Input
                id="settings-plan-name"
                value={planName}
                onChange={(e) => setPlanName(e.target.value)}
                maxLength={255}
                required
                className="flex-1"
              />
              <Button
                type="submit"
                disabled={
                  renameMutation.isPending || !planName.trim() || planName.trim() === plan.name
                }
              >
                {renameMutation.isPending && <Spinner className="size-4" />}
                {renameMutation.isPending ? 'Saving…' : 'Save'}
              </Button>
            </div>
            {nameError && <p className="text-status-text-danger text-xs">{nameError}</p>}
          </form>

          <hr className="border-overlay/5" />

          <div>
            <p className="text-sm text-fg-muted mb-3">Danger zone</p>
            <Button
              variant="destructive"
              type="button"
              onClick={handleDeletePlan}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? <Spinner className="size-4" /> : <TrashIcon size={14} />}
              {deleteMutation.isPending ? 'Deleting…' : 'Delete plan'}
            </Button>
            {deleteError && <p className="mt-2 text-status-text-danger text-xs">{deleteError}</p>}
          </div>
        </div>
      )}

      {activeTab === 'members' && (
        <div className="space-y-4">
          <ul className="space-y-1">
            {plan.members.map((m) => (
              <li
                key={m.actorId}
                className="flex items-center justify-between px-3 py-2 rounded-md bg-surface border border-overlay/5"
              >
                <div>
                  <span className="text-sm text-fg-primary font-mono">{m.actorId}</span>
                  <span className="ml-2 text-xs text-fg-subtle capitalize">{m.role}</span>
                </div>
                {m.actorId !== session.actorId && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    type="button"
                    onClick={() => removeMemberMutation.mutate(m.actorId)}
                    aria-label="Remove member"
                  >
                    <XIcon size={14} />
                  </Button>
                )}
              </li>
            ))}
          </ul>

          <form onSubmit={handleAddMember} className="pt-2 space-y-3">
            <p className="text-sm text-fg-muted">Add member</p>
            <div className="flex gap-2">
              <Input
                value={newMemberActorId}
                onChange={(e) => setNewMemberActorId(e.target.value)}
                placeholder="Actor ID (UUID)"
                className="flex-1"
              />
              <Select
                value={newMemberRole}
                onValueChange={(v) => setNewMemberRole(v as 'owner' | 'editor' | 'viewer')}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="viewer">Viewer</SelectItem>
                  <SelectItem value="editor">Editor</SelectItem>
                  <SelectItem value="owner">Owner</SelectItem>
                </SelectContent>
              </Select>
              <Button
                type="submit"
                disabled={addMemberMutation.isPending || !newMemberActorId.trim()}
              >
                <UserPlusIcon size={14} />
                Add
              </Button>
            </div>
            {memberError && <p className="text-status-text-danger text-xs">{memberError}</p>}
            {mutationError && <p className="text-status-text-danger text-xs">{mutationError}</p>}
          </form>
        </div>
      )}

      {activeTab === 'labels' && (
        <div className="space-y-3">
          {mutationError && <p className="text-status-text-danger text-xs">{mutationError}</p>}
          <LabelEditor
            labels={plan.labels}
            onRename={handleRenameLabel}
            onRecolor={handleRecolorLabel}
          />
        </div>
      )}
    </main>
  )
}
