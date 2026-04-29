'use client'

import { useState } from 'react'
import { useMutation, useQuery } from '@future/api-client'
import { useSession } from '@future/auth'
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Spinner,
} from '@future/ui'
import { trpc } from '../../../../lib/trpc'
import { LinkedRostersTable, type LinkedRosterDto } from './linked-rosters-table'
import { MintRosterForm } from './mint-roster-form'
import { LinkExistingRosterForm } from './link-existing-roster-form'

interface PlannerMsSyncFlagsTrpcSlice {
  flags: {
    query: (input: { tenantId: string }) => Promise<{
      msSyncAttachmentsEnabled: boolean
      msSyncRostersEnabled: boolean
    }>
  }
}

interface PlannerMsSyncRostersTrpcSlice {
  listLinked: { query: (input: { tenantId: string }) => Promise<LinkedRosterDto[]> }
  mint: {
    mutate: (input: {
      tenantId: string
      actorId: string
      displayName: string
      initialMemberActorIds: string[]
    }) => Promise<{ msRosterId: string; localId: string }>
  }
  linkExisting: {
    mutate: (input: {
      tenantId: string
      actorId: string
      msRosterId: string
      displayName?: string
    }) => Promise<void>
  }
  unlink: {
    mutate: (input: { tenantId: string; actorId: string; msRosterId: string }) => Promise<void>
  }
}

interface PlannerTrpcSlice {
  msSync: PlannerMsSyncFlagsTrpcSlice & {
    rosters: PlannerMsSyncRostersTrpcSlice
  }
}

export default function RostersPage() {
  const session = useSession()
  const [mintDialogOpen, setMintDialogOpen] = useState(false)
  const [linkDialogOpen, setLinkDialogOpen] = useState(false)
  const [mintError, setMintError] = useState<string | null>(null)
  const [linkError, setLinkError] = useState<string | null>(null)

  const planner = trpc.planner as unknown as PlannerTrpcSlice

  const flagsQuery = useQuery({
    queryKey: ['planner.msSync.flags', session?.tenantId],
    queryFn: () => planner.msSync.flags.query({ tenantId: session!.tenantId }),
    enabled: !!session,
  })

  const rostersQuery = useQuery({
    queryKey: ['planner.msSync.rosters.listLinked', session?.tenantId],
    queryFn: () => planner.msSync.rosters.listLinked.query({ tenantId: session!.tenantId }),
    enabled: !!session && flagsQuery.data?.msSyncRostersEnabled === true,
  })

  const mintMutation = useMutation({
    mutationFn: (values: { displayName: string }) =>
      planner.msSync.rosters.mint.mutate({
        tenantId: session!.tenantId,
        actorId: session!.actorId,
        displayName: values.displayName,
        initialMemberActorIds: [],
      }),
    onSuccess: async () => {
      setMintDialogOpen(false)
      setMintError(null)
      await rostersQuery.refetch()
    },
    onError: (error: unknown) => {
      setMintError(error instanceof Error ? error.message : 'Failed to create roster')
    },
  })

  const linkMutation = useMutation({
    mutationFn: (values: { msRosterId: string; displayName?: string }) =>
      planner.msSync.rosters.linkExisting.mutate({
        tenantId: session!.tenantId,
        actorId: session!.actorId,
        ...values,
      }),
    onSuccess: async () => {
      setLinkDialogOpen(false)
      setLinkError(null)
      await rostersQuery.refetch()
    },
    onError: (error: unknown) => {
      setLinkError(error instanceof Error ? error.message : 'Failed to link roster')
    },
  })

  const unlinkMutation = useMutation({
    mutationFn: (msRosterId: string) =>
      planner.msSync.rosters.unlink.mutate({
        tenantId: session!.tenantId,
        actorId: session!.actorId,
        msRosterId,
      }),
    onSuccess: async () => {
      await rostersQuery.refetch()
    },
  })

  if (!session) {
    return (
      <main className="max-w-3xl space-y-4 p-8">
        <h1 className="text-h2">Rosters</h1>
        <p className="text-sm text-muted-foreground">Loading session…</p>
      </main>
    )
  }

  if (rostersQuery.isLoading) {
    return (
      <main className="max-w-3xl space-y-4 p-8">
        <h1 className="text-h2">Rosters</h1>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner className="size-4" />
          Loading rosters…
        </p>
      </main>
    )
  }

  return (
    <main className="max-w-3xl space-y-6 p-8">
      <header className="space-y-2">
        <h1 className="text-h2">Rosters</h1>
        <p className="text-sm text-muted-foreground">
          Manage Microsoft Planner rosters linked to Future.
        </p>
      </header>

      {flagsQuery.data?.msSyncRostersEnabled === false && (
        <Alert>
          <AlertTitle>Roster sync disabled</AlertTitle>
          <AlertDescription>Roster sync is disabled.</AlertDescription>
        </Alert>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-h3">Linked Rosters</h2>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setLinkError(null)
                setLinkDialogOpen(true)
              }}
            >
              Link Existing
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setMintError(null)
                setMintDialogOpen(true)
              }}
            >
              Mint Roster
            </Button>
          </div>
        </div>

        <LinkedRostersTable
          rosters={rostersQuery.data ?? []}
          isLoading={rostersQuery.isLoading}
          error={rostersQuery.isError ? 'Failed to load rosters' : undefined}
          onUnlink={(msRosterId) => unlinkMutation.mutate(msRosterId)}
          onRetry={() => rostersQuery.refetch()}
        />
      </section>

      <Dialog
        open={mintDialogOpen}
        onOpenChange={(open) => {
          setMintDialogOpen(open)
          if (!open) setMintError(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mint Roster</DialogTitle>
            <DialogDescription>
              Create a new Microsoft Planner roster managed by Future.
            </DialogDescription>
          </DialogHeader>
          <MintRosterForm
            isSubmitting={mintMutation.isPending}
            error={mintError}
            onSubmit={(values) => mintMutation.mutate(values)}
          />
        </DialogContent>
      </Dialog>

      <Dialog
        open={linkDialogOpen}
        onOpenChange={(open) => {
          setLinkDialogOpen(open)
          if (!open) setLinkError(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link Existing Roster</DialogTitle>
            <DialogDescription>
              Connect an existing Microsoft Planner roster to Future by its ID.
            </DialogDescription>
          </DialogHeader>
          <LinkExistingRosterForm
            isSubmitting={linkMutation.isPending}
            error={linkError}
            onSubmit={(values) => linkMutation.mutate(values)}
          />
        </DialogContent>
      </Dialog>
    </main>
  )
}
