export default async function PlanBoardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return (
    <main className="p-8">
      <p className="text-fg-muted text-sm">Board coming in Plan 02.</p>
      <a
        href={`/plans/${id}/settings`}
        className="mt-4 inline-block text-sm text-brand hover:text-accent-hover transition-colors"
      >
        Settings →
      </a>
    </main>
  )
}
