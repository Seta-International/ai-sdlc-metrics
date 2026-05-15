import { meQueryOptions } from '@seta/identity-client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, redirect } from '@tanstack/react-router'

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
  const { data } = useQuery({
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

  if (!data) return <div className="p-8">Loading…</div>

  return (
    <div className="max-w-3xl space-y-4 p-8">
      <h1 className="text-xl font-semibold text-ink">Members</h1>
      <table className="w-full text-sm">
        <thead className="text-ink-muted">
          <tr>
            <th className="p-2 text-left">Name</th>
            <th className="p-2 text-left">Email</th>
            <th className="p-2 text-left">Role</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {data.members.map((m) => (
            <tr key={m.userId} className="border-t border-hairline">
              <td className="p-2">{m.name}</td>
              <td className="p-2">{m.email}</td>
              <td className="p-2">
                <select
                  value={m.role}
                  onChange={(e) =>
                    setRole.mutate({ userId: m.userId, role: e.target.value as MemberRole })
                  }
                  className="rounded border border-hairline bg-canvas-soft px-2 py-1"
                >
                  <option value="owner">owner</option>
                  <option value="admin">admin</option>
                  <option value="member">member</option>
                </select>
              </td>
              <td className="p-2">
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(`Remove ${m.name}?`)) removeMember.mutate(m.userId)
                  }}
                  className="text-sm text-red-600"
                >
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
