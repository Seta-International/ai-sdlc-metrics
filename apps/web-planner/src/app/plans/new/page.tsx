'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from '@future/auth'
import { trpc } from '../../../lib/trpc'

export default function NewPlanPage() {
  const router = useRouter()
  const session = useSession()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!session || !name.trim()) return

    setSubmitting(true)
    setError(null)

    const planId = crypto.randomUUID()
    const bucketId = crypto.randomUUID()

    try {
      await trpc.planner.plans.create.mutate({
        actorId: session.actorId,
        tenantId: session.tenantId,
        id: planId,
        bucketId,
        name: name.trim(),
        description: description.trim() || null,
      })
      router.push(`/plans/${planId}/board`)
    } catch {
      setError('Failed to create plan. Please try again.')
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/85 flex items-center justify-center z-50">
      <div className="bg-surface border border-overlay/8 rounded-xl p-6 w-full max-w-md shadow-2xl">
        <h2 className="text-lg font-510 text-fg-primary mb-4">New plan</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-fg-muted mb-1.5" htmlFor="plan-name">
              Name
            </label>
            <input
              id="plan-name"
              autoFocus
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My plan"
              maxLength={255}
              required
              className="w-full px-3 py-2 rounded-md bg-black/40 border border-overlay/8 text-sm text-fg-primary placeholder:text-fg-subtle outline-none focus:border-brand transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm text-fg-muted mb-1.5" htmlFor="plan-description">
              Description <span className="text-fg-subtle">(optional)</span>
            </label>
            <textarea
              id="plan-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this plan for?"
              rows={3}
              className="w-full px-3 py-2 rounded-md bg-black/40 border border-overlay/8 text-sm text-fg-primary placeholder:text-fg-subtle outline-none focus:border-brand transition-colors resize-none"
            />
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div className="flex items-center justify-end gap-3 pt-2">
            <a
              href="/plans"
              className="px-3 py-1.5 rounded-md text-sm text-fg-muted hover:text-fg-primary hover:bg-overlay/5 transition-colors"
            >
              Cancel
            </a>
            <button
              type="submit"
              disabled={submitting || !name.trim()}
              className="px-4 py-1.5 rounded-md bg-brand hover:bg-accent-hover text-fg-primary text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? 'Creating…' : 'Create plan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
