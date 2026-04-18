'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { UserPlusIcon, TrashIcon, XIcon } from 'lucide-react'
import { useSession } from '@future/auth'
import { trpc } from '../../../../lib/trpc'
import { LabelEditor } from '../../../../components/label-editor'

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

  const [plan, setPlan] = useState<PlanDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('details')

  // Details tab state
  const [planName, setPlanName] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Members tab state
  const [newMemberActorId, setNewMemberActorId] = useState('')
  const [newMemberRole, setNewMemberRole] = useState<'owner' | 'editor' | 'viewer'>('editor')
  const [addingMember, setAddingMember] = useState(false)
  const [memberError, setMemberError] = useState<string | null>(null)

  useEffect(() => {
    if (!session || !planId) return
    trpc.planner.plans.get
      .query({ actorId: session.actorId, tenantId: session.tenantId, planId })
      .then((data) => {
        const detail = data as unknown as PlanDetail | null
        if (detail) {
          setPlan(detail)
          setPlanName(detail.name)
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [session, planId])

  async function handleRenamePlan(e: React.FormEvent) {
    e.preventDefault()
    if (!session || !planName.trim() || !planId) return
    setSavingName(true)
    setNameError(null)
    try {
      await trpc.planner.plans.rename.mutate({
        actorId: session.actorId,
        tenantId: session.tenantId,
        planId,
        name: planName.trim(),
      })
      setPlan((prev) => (prev ? { ...prev, name: planName.trim() } : prev))
    } catch {
      setNameError('Failed to rename plan.')
    } finally {
      setSavingName(false)
    }
  }

  async function handleDeletePlan() {
    if (!session || !planId) return
    if (!confirm('Delete this plan? This cannot be undone.')) return
    setDeleting(true)
    try {
      await trpc.planner.plans.delete.mutate({
        actorId: session.actorId,
        tenantId: session.tenantId,
        planId,
      })
      router.push('/plans')
    } catch {
      setDeleting(false)
    }
  }

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault()
    if (!session || !newMemberActorId.trim() || !planId) return
    setAddingMember(true)
    setMemberError(null)
    try {
      await trpc.planner.plans.addMember.mutate({
        actorId: session.actorId,
        tenantId: session.tenantId,
        planId,
        targetActorId: newMemberActorId.trim(),
        role: newMemberRole,
      })
      setPlan((prev) =>
        prev
          ? {
              ...prev,
              members: [
                ...prev.members.filter((m) => m.actorId !== newMemberActorId.trim()),
                { actorId: newMemberActorId.trim(), role: newMemberRole },
              ],
            }
          : prev,
      )
      setNewMemberActorId('')
    } catch {
      setMemberError('Failed to add member. Check the actor ID and try again.')
    } finally {
      setAddingMember(false)
    }
  }

  async function handleRemoveMember(targetActorId: string) {
    if (!session || !planId) return
    try {
      await trpc.planner.plans.removeMember.mutate({
        actorId: session.actorId,
        tenantId: session.tenantId,
        planId,
        targetActorId,
      })
      setPlan((prev) =>
        prev ? { ...prev, members: prev.members.filter((m) => m.actorId !== targetActorId) } : prev,
      )
    } catch (err) {
      console.error('Failed to remove member', err)
    }
  }

  async function handleRenameLabel(slot: string, name: string) {
    if (!session || !planId) return
    try {
      await trpc.planner.labels.rename.mutate({
        actorId: session.actorId,
        tenantId: session.tenantId,
        planId,
        slot,
        name,
      })
      setPlan((prev) =>
        prev
          ? {
              ...prev,
              labels: [
                ...prev.labels.filter((l) => l.slot !== slot),
                { slot, name, color: prev.labels.find((l) => l.slot === slot)?.color ?? '#6B7280' },
              ],
            }
          : prev,
      )
    } catch (err) {
      console.error('Failed to rename label', err)
    }
  }

  async function handleRecolorLabel(slot: string, name: string, color: string) {
    if (!session || !planId) return
    try {
      await trpc.planner.labels.recolor.mutate({
        actorId: session.actorId,
        tenantId: session.tenantId,
        planId,
        slot,
        name,
        color,
      })
      setPlan((prev) =>
        prev
          ? {
              ...prev,
              labels: [...prev.labels.filter((l) => l.slot !== slot), { slot, name, color }],
            }
          : prev,
      )
    } catch (err) {
      console.error('Failed to recolor label', err)
    }
  }

  if (!session || loading) {
    return (
      <main className="p-8">
        <div className="h-6 w-48 bg-overlay/5 rounded animate-pulse" />
      </main>
    )
  }

  if (!plan) {
    return (
      <main className="p-8">
        <p className="text-fg-muted text-sm">Plan not found.</p>
        <a href="/plans" className="mt-2 inline-block text-sm text-brand hover:text-accent-hover">
          ← Back to plans
        </a>
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
        <h1 className="text-2xl font-[400] tracking-h2 text-fg-primary">{plan.name} — Settings</h1>
        <a
          href={`/plans/${planId}/board`}
          className="text-sm text-fg-muted hover:text-fg-primary transition-colors"
        >
          ← Board
        </a>
      </div>

      <div className="flex gap-1 mb-6 border-b border-overlay/8">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm transition-colors border-b-2 -mb-px ${
              activeTab === tab.key
                ? 'border-brand text-fg-primary'
                : 'border-transparent text-fg-muted hover:text-fg-secondary'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'details' && (
        <div className="space-y-6">
          <form onSubmit={handleRenamePlan} className="space-y-3">
            <label className="block text-sm text-fg-muted" htmlFor="settings-plan-name">
              Name
            </label>
            <div className="flex gap-2">
              <input
                id="settings-plan-name"
                type="text"
                value={planName}
                onChange={(e) => setPlanName(e.target.value)}
                maxLength={255}
                required
                className="flex-1 px-3 py-2 rounded-md bg-black/40 border border-overlay/8 text-sm text-fg-primary outline-none focus:border-brand transition-colors"
              />
              <button
                type="submit"
                disabled={savingName || !planName.trim() || planName.trim() === plan.name}
                className="px-3 py-2 rounded-md bg-brand hover:bg-accent-hover text-fg-primary text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {savingName ? 'Saving…' : 'Save'}
              </button>
            </div>
            {nameError && <p className="text-red-400 text-xs">{nameError}</p>}
          </form>

          <hr className="border-overlay/5" />

          <div>
            <p className="text-sm text-fg-muted mb-3">Danger zone</p>
            <button
              type="button"
              onClick={handleDeletePlan}
              disabled={deleting}
              className="flex items-center gap-2 px-3 py-2 rounded-md border border-red-800/60 text-red-400 hover:bg-red-900/20 text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <TrashIcon size={14} />
              {deleting ? 'Deleting…' : 'Delete plan'}
            </button>
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
                  <button
                    type="button"
                    onClick={() => handleRemoveMember(m.actorId)}
                    className="p-1 rounded text-fg-subtle hover:text-red-400 hover:bg-red-900/20 transition-colors"
                    aria-label="Remove member"
                  >
                    <XIcon size={14} />
                  </button>
                )}
              </li>
            ))}
          </ul>

          <form onSubmit={handleAddMember} className="pt-2 space-y-3">
            <p className="text-sm text-fg-muted">Add member</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={newMemberActorId}
                onChange={(e) => setNewMemberActorId(e.target.value)}
                placeholder="Actor ID (UUID)"
                className="flex-1 px-3 py-2 rounded-md bg-black/40 border border-overlay/8 text-sm text-fg-primary placeholder:text-fg-subtle outline-none focus:border-brand transition-colors font-mono"
              />
              <select
                value={newMemberRole}
                onChange={(e) => setNewMemberRole(e.target.value as 'owner' | 'editor' | 'viewer')}
                className="px-3 py-2 rounded-md bg-black/40 border border-overlay/8 text-sm text-fg-primary outline-none focus:border-brand transition-colors"
              >
                <option value="viewer">Viewer</option>
                <option value="editor">Editor</option>
                <option value="owner">Owner</option>
              </select>
              <button
                type="submit"
                disabled={addingMember || !newMemberActorId.trim()}
                className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-brand hover:bg-accent-hover text-fg-primary text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <UserPlusIcon size={14} />
                Add
              </button>
            </div>
            {memberError && <p className="text-red-400 text-xs">{memberError}</p>}
          </form>
        </div>
      )}

      {activeTab === 'labels' && (
        <LabelEditor
          labels={plan.labels}
          onRename={handleRenameLabel}
          onRecolor={handleRecolorLabel}
        />
      )}
    </main>
  )
}
