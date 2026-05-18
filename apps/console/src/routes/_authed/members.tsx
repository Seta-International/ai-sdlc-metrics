import { meQueryOptions } from '@seta/identity-client'
import { type Column, DataTable, EmptyState } from '@seta/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { Users } from 'lucide-react'

type MemberRole = 'owner' | 'admin' | 'member'

type Member = {
  userId: string
  email: string
  name: string
  pictureUrl: string | null
  role: MemberRole
  source: string
  joinedAt: string
}

export const Route = createFileRoute('/_authed/members')({
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQueryOptions)
    if (!me.tenant?.isAdmin) throw redirect({ to: '/' })
  },
  component: MembersPage,
})

function MembersPage() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['members'],
    queryFn: async () => {
      const res = await fetch('/members', { credentials: 'include' })
      if (!res.ok) throw new Error(`members ${res.status}`)
      return (await res.json()) as { members: Member[] }
    },
  })

  const setRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: MemberRole }) => {
      const res = await fetch(`/members/${userId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ role }),
      })
      if (!res.ok) throw new Error(`patch ${res.status}`)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['members'] }),
  })

  const removeMember = useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetch(`/members/${userId}`, { method: 'DELETE', credentials: 'include' })
      if (!res.ok) throw new Error(`delete ${res.status}`)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['members'] }),
  })

  if (isLoading) return <div className="p-8">Loading…</div>

  const rows = data?.members ?? []

  const columns: Column<Member>[] = [
    {
      key: 'name',
      header: 'Name',
      cell: (m) => m.name,
      sortable: true,
      compare: (a, b) => a.name.localeCompare(b.name),
    },
    {
      key: 'email',
      header: 'Email',
      cell: (m) => m.email,
      sortable: true,
      compare: (a, b) => a.email.localeCompare(b.email),
    },
    {
      key: 'role',
      header: 'Role',
      cell: (m) => (
        <select
          value={m.role}
          onChange={(e) => setRole.mutate({ userId: m.userId, role: e.target.value as MemberRole })}
          className="rounded border border-hairline bg-canvas-soft px-2 py-1 text-[13px]"
        >
          <option value="owner">owner</option>
          <option value="admin">admin</option>
          <option value="member">member</option>
        </select>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (m) => (
        <button
          type="button"
          onClick={() => {
            if (confirm(`Remove ${m.name}?`)) removeMember.mutate(m.userId)
          }}
          className="text-[13px] text-error hover:underline"
        >
          Remove
        </button>
      ),
    },
  ]

  return (
    <div className="max-w-3xl space-y-4 p-8">
      <h1 className="text-xl font-semibold text-ink">Members</h1>
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(m) => m.userId}
        empty={
          <EmptyState
            icon={Users}
            title="No members"
            description="Invite teammates to collaborate."
          />
        }
      />
    </div>
  )
}
