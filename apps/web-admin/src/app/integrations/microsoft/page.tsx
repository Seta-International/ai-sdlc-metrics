'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useMutation, useQuery } from '@future/api-client'
import { useSession } from '@future/auth'
import { ArrowRight } from '@future/ui/icons'
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
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@future/ui'
import { trpc } from '../../../lib/trpc'
import { ConnectForm } from './connect-form'
import { InvalidBanner } from './invalid-banner'
import { StatusCard } from './status-card'
import { LinkedGroupsTable, type LinkedGroupDto } from './linked-groups-table'
import { LinkGroupDrawer } from './link-group-drawer'
import { BackfillProgressSlideover } from './backfill-progress-slideover'
import { LinkedRostersTable, type LinkedRosterDto } from './rosters/linked-rosters-table'
import { MintRosterForm } from './rosters/mint-roster-form'
import { LinkExistingRosterForm } from './rosters/link-existing-roster-form'
import { ConflictTable } from './conflicts/conflict-table'
import type { ConflictDto } from './conflicts/conflict-row'

interface MsSyncStatus {
  connected: boolean
  status: 'active' | 'invalid' | 'paused' | null
  tenantAdId: string | null
  clientId: string | null
  connectedAt: string | null
  lastError: string | null
}

interface PlannerTrpcSlice {
  msSync: {
    status: { query: (input: { tenantId: string }) => Promise<MsSyncStatus> }
    flags: {
      query: (input: { tenantId: string }) => Promise<{
        msSyncAttachmentsEnabled: boolean
        msSyncRostersEnabled: boolean
      }>
    }
    connect: {
      mutate: (input: {
        tenantId: string
        actorId: string
        tenantAdId: string
        clientId: string
        clientSecret: string
      }) => Promise<void>
    }
    disconnect: {
      pause: { mutate: (input: { tenantId: string; actorId: string }) => Promise<void> }
      destroy: { mutate: (input: { tenantId: string; actorId: string }) => Promise<void> }
    }
    groups: {
      listLinked: { query: (input: { tenantId: string }) => Promise<LinkedGroupDto[]> }
      unlink: {
        mutate: (input: { tenantId: string; actorId: string; msGroupId: string }) => Promise<void>
      }
    }
    rosters: {
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
    conflicts: {
      list: {
        query: (input: {
          tenantId: string
          resolved: 'open' | 'all'
          limit?: number
        }) => Promise<{ conflicts: ConflictDto[]; nextCursor: string | null }>
      }
    }
  }
}

const FLAG_DISABLED_RE = /(planner is not enabled|ms_sync|feature flag|not enabled)/i

export default function MicrosoftIntegrationPage() {
  const session = useSession()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [connectError, setConnectError] = useState<string | null>(null)
  const [linkDrawerOpen, setLinkDrawerOpen] = useState(false)
  const [backfillSlideoverOpen, setBackfillSlideoverOpen] = useState(false)
  const [backfillJobId, setBackfillJobId] = useState<string | null>(null)
  const [mintRosterDialogOpen, setMintRosterDialogOpen] = useState(false)
  const [linkRosterDialogOpen, setLinkRosterDialogOpen] = useState(false)
  const [mintRosterError, setMintRosterError] = useState<string | null>(null)
  const [linkRosterError, setLinkRosterError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'groups' | 'rosters' | 'conflicts'>('groups')

  const planner = trpc.planner as unknown as PlannerTrpcSlice

  const statusQuery = useQuery({
    queryKey: ['planner.msSync.status', session?.tenantId],
    queryFn: () => planner.msSync.status.query({ tenantId: session!.tenantId }),
    enabled: !!session,
  })

  const flagsQuery = useQuery({
    queryKey: ['planner.msSync.flags', session?.tenantId],
    queryFn: () => planner.msSync.flags.query({ tenantId: session!.tenantId }),
    enabled: !!session,
  })

  const connectMutation = useMutation({
    mutationFn: (values: { tenantAdId: string; clientId: string; clientSecret: string }) =>
      planner.msSync.connect.mutate({
        tenantId: session!.tenantId,
        actorId: session!.actorId,
        ...values,
      }),
    onSuccess: async () => {
      setDialogOpen(false)
      setConnectError(null)
      await statusQuery.refetch()
    },
    onError: (error: unknown) => {
      setConnectError(error instanceof Error ? error.message : 'Failed to validate credentials')
    },
  })

  const pauseMutation = useMutation({
    mutationFn: () =>
      planner.msSync.disconnect.pause.mutate({
        tenantId: session!.tenantId,
        actorId: session!.actorId,
      }),
    onSuccess: async () => {
      await statusQuery.refetch()
    },
  })

  const destroyMutation = useMutation({
    mutationFn: () =>
      planner.msSync.disconnect.destroy.mutate({
        tenantId: session!.tenantId,
        actorId: session!.actorId,
      }),
    onSuccess: async () => {
      await statusQuery.refetch()
    },
  })

  const linkedGroupsQuery = useQuery({
    queryKey: ['planner.msSync.groups.listLinked', session?.tenantId],
    queryFn: () => planner.msSync.groups.listLinked.query({ tenantId: session!.tenantId }),
    enabled:
      !!session && statusQuery.data?.connected === true && statusQuery.data?.status !== 'invalid',
  })

  const unlinkMutation = useMutation({
    mutationFn: (msGroupId: string) =>
      planner.msSync.groups.unlink.mutate({
        tenantId: session!.tenantId,
        actorId: session!.actorId,
        msGroupId,
      }),
    onSuccess: async () => {
      await linkedGroupsQuery.refetch()
    },
  })

  const linkedRostersQuery = useQuery({
    queryKey: ['planner.msSync.rosters.listLinked', session?.tenantId],
    queryFn: () => planner.msSync.rosters.listLinked.query({ tenantId: session!.tenantId }),
    enabled:
      !!session &&
      statusQuery.data?.connected === true &&
      statusQuery.data?.status !== 'invalid' &&
      flagsQuery.data?.msSyncRostersEnabled === true,
  })

  const mintRosterMutation = useMutation({
    mutationFn: (values: { displayName: string }) =>
      planner.msSync.rosters.mint.mutate({
        tenantId: session!.tenantId,
        actorId: session!.actorId,
        displayName: values.displayName,
        initialMemberActorIds: [],
      }),
    onSuccess: async () => {
      setMintRosterDialogOpen(false)
      setMintRosterError(null)
      await linkedRostersQuery.refetch()
    },
    onError: (error: unknown) => {
      setMintRosterError(error instanceof Error ? error.message : 'Failed to create roster')
    },
  })

  const linkRosterMutation = useMutation({
    mutationFn: (values: { msRosterId: string; displayName?: string }) =>
      planner.msSync.rosters.linkExisting.mutate({
        tenantId: session!.tenantId,
        actorId: session!.actorId,
        ...values,
      }),
    onSuccess: async () => {
      setLinkRosterDialogOpen(false)
      setLinkRosterError(null)
      await linkedRostersQuery.refetch()
    },
    onError: (error: unknown) => {
      setLinkRosterError(error instanceof Error ? error.message : 'Failed to link roster')
    },
  })

  const unlinkRosterMutation = useMutation({
    mutationFn: (msRosterId: string) =>
      planner.msSync.rosters.unlink.mutate({
        tenantId: session!.tenantId,
        actorId: session!.actorId,
        msRosterId,
      }),
    onSuccess: async () => {
      await linkedRostersQuery.refetch()
    },
  })

  const openConflictsQuery = useQuery({
    queryKey: ['planner.msSync.conflicts.list.open', session?.tenantId],
    queryFn: () =>
      planner.msSync.conflicts.list.query({
        tenantId: session!.tenantId,
        resolved: 'open',
        limit: 100,
      }),
    enabled:
      !!session && statusQuery.data?.connected === true && statusQuery.data?.status !== 'invalid',
  })

  if (!session) {
    return (
      <main className="max-w-3xl space-y-4 p-8">
        <h1 className="text-h2">Microsoft 365</h1>
        <p className="text-sm text-muted-foreground">Loading session…</p>
      </main>
    )
  }

  if (statusQuery.isLoading) {
    return (
      <main className="max-w-3xl space-y-4 p-8">
        <h1 className="text-h2">Microsoft 365</h1>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner className="size-4" />
          Loading integration status…
        </p>
      </main>
    )
  }

  const loadError = statusQuery.error instanceof Error ? statusQuery.error.message : null
  const flagDisabled = !!(statusQuery.isError && loadError && FLAG_DISABLED_RE.test(loadError))

  if (flagDisabled) {
    return (
      <main className="max-w-3xl space-y-4 p-8">
        <h1 className="text-h2">Microsoft 365</h1>
        <Alert>
          <AlertTitle>Coming soon for this tenant</AlertTitle>
          <AlertDescription>
            Microsoft 365 sync is not enabled. Ask a platform admin to enable the
            `planner.ms_sync.enabled` flag for this tenant.
          </AlertDescription>
        </Alert>
      </main>
    )
  }

  if (statusQuery.isError || !statusQuery.data) {
    return (
      <main className="max-w-3xl space-y-4 p-8">
        <h1 className="text-h2">Microsoft 365</h1>
        <Alert variant="destructive">
          <AlertTitle>Failed to load Microsoft 365 integration</AlertTitle>
          <AlertDescription>{loadError ?? 'Unknown error'}</AlertDescription>
        </Alert>
      </main>
    )
  }

  const status = statusQuery.data
  const isPending =
    connectMutation.isPending || pauseMutation.isPending || destroyMutation.isPending
  const openConflictCount = openConflictsQuery.data?.conflicts?.length ?? 0

  return (
    <main className="max-w-3xl space-y-6 p-8">
      <header className="space-y-2">
        <h1 className="text-h2">Microsoft 365</h1>
        <p className="text-sm text-muted-foreground">
          Connect Future to your organization&apos;s Microsoft 365 Planner.
        </p>
      </header>

      {!status.connected ? (
        <>
          <Dialog
            open={dialogOpen}
            onOpenChange={(open) => {
              setDialogOpen(open)
              if (!open) setConnectError(null)
            }}
          >
            <Button onClick={() => setDialogOpen(true)}>Connect Microsoft 365</Button>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Connect Microsoft 365</DialogTitle>
                <DialogDescription>
                  Enter your Azure AD tenant, client ID, and client secret.
                </DialogDescription>
              </DialogHeader>
              <ConnectForm
                isSubmitting={connectMutation.isPending}
                error={connectError}
                onSubmit={(values) => connectMutation.mutate(values)}
              />
            </DialogContent>
          </Dialog>
        </>
      ) : status.status === 'invalid' ? (
        <>
          <InvalidBanner
            reason={status.lastError}
            onReconnect={() => {
              if (pauseMutation.isPending || destroyMutation.isPending) return
              destroyMutation.mutate(undefined, {
                onSuccess: async () => {
                  setConnectError(null)
                  setDialogOpen(true)
                  await statusQuery.refetch()
                },
              })
            }}
          />
          <Dialog
            open={dialogOpen}
            onOpenChange={(open) => {
              setDialogOpen(open)
              if (!open) setConnectError(null)
            }}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Reconnect Microsoft 365</DialogTitle>
                <DialogDescription>
                  Update your credentials to resume Planner synchronization.
                </DialogDescription>
              </DialogHeader>
              <ConnectForm
                isSubmitting={connectMutation.isPending}
                error={connectError}
                onSubmit={(values) => connectMutation.mutate(values)}
              />
            </DialogContent>
          </Dialog>
        </>
      ) : (
        <>
          {flagsQuery.data?.msSyncAttachmentsEnabled === false && (
            <Alert>
              <AlertTitle>Attachment sync disabled</AlertTitle>
              <AlertDescription>
                Attachment sync is disabled by SETA. Existing files remain downloadable; new files
                stay in Future.
              </AlertDescription>
            </Alert>
          )}
          <StatusCard
            connectedAt={status.connectedAt}
            tenantAdId={status.tenantAdId ?? ''}
            onPause={() => {
              if (pauseMutation.isPending || destroyMutation.isPending) return
              pauseMutation.mutate()
            }}
            onDestroy={() => {
              if (pauseMutation.isPending || destroyMutation.isPending) return
              if (!confirm('Disconnect and keep data as Future-only? This cannot be undone.'))
                return
              destroyMutation.mutate()
            }}
          />

          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
            <TabsList>
              <TabsTrigger value="groups">Linked Groups</TabsTrigger>
              {flagsQuery.data?.msSyncRostersEnabled === true && (
                <TabsTrigger value="rosters">Linked Rosters</TabsTrigger>
              )}
              <TabsTrigger value="conflicts">
                Conflicts{openConflictCount > 0 ? ` (${openConflictCount})` : ''}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="groups" className="mt-4">
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-h3">Linked Groups</h2>
                  <Button size="sm" onClick={() => setLinkDrawerOpen(true)}>
                    Link Group
                  </Button>
                </div>
                <LinkedGroupsTable
                  groups={linkedGroupsQuery.data ?? []}
                  isLoading={linkedGroupsQuery.isLoading}
                  error={linkedGroupsQuery.isError ? 'Failed to load linked groups' : undefined}
                  onUnlink={(msGroupId) => unlinkMutation.mutate(msGroupId)}
                  onRetry={() => linkedGroupsQuery.refetch()}
                />
              </section>
            </TabsContent>

            {flagsQuery.data?.msSyncRostersEnabled === true && (
              <TabsContent value="rosters" className="mt-4">
                <section className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-h3">Linked Rosters</h2>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setLinkRosterError(null)
                          setLinkRosterDialogOpen(true)
                        }}
                      >
                        Link Existing
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => {
                          setMintRosterError(null)
                          setMintRosterDialogOpen(true)
                        }}
                      >
                        Mint
                      </Button>
                    </div>
                  </div>
                  <LinkedRostersTable
                    rosters={linkedRostersQuery.data ?? []}
                    isLoading={linkedRostersQuery.isLoading}
                    error={linkedRostersQuery.isError ? 'Failed to load linked rosters' : undefined}
                    onUnlink={(msRosterId) => unlinkRosterMutation.mutate(msRosterId)}
                    onRetry={() => linkedRostersQuery.refetch()}
                  />
                </section>
              </TabsContent>
            )}

            <TabsContent value="conflicts" className="mt-4">
              <ConflictTable
                conflicts={openConflictsQuery.data?.conflicts ?? []}
                isLoading={openConflictsQuery.isLoading}
                error={openConflictsQuery.isError ? 'Failed to load conflicts' : undefined}
                onRetry={() => openConflictsQuery.refetch()}
                onActionSuccess={() => openConflictsQuery.refetch()}
              />
              <div className="mt-3 flex justify-end">
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/integrations/microsoft/conflicts">
                    View full history
                    <ArrowRight className="ml-1 size-3" />
                  </Link>
                </Button>
              </div>
            </TabsContent>
          </Tabs>

          <LinkGroupDrawer
            open={linkDrawerOpen}
            onOpenChange={setLinkDrawerOpen}
            tenantId={session.tenantId}
            actorId={session.actorId}
            onLinked={() => linkedGroupsQuery.refetch()}
            onBackfillStarted={(jobId) => {
              setBackfillJobId(jobId)
              setBackfillSlideoverOpen(true)
            }}
          />

          {backfillJobId && (
            <BackfillProgressSlideover
              open={backfillSlideoverOpen}
              onOpenChange={setBackfillSlideoverOpen}
              jobId={backfillJobId}
            />
          )}

          {flagsQuery.data?.msSyncRostersEnabled === true && (
            <>
              <Dialog
                open={mintRosterDialogOpen}
                onOpenChange={(open) => {
                  setMintRosterDialogOpen(open)
                  if (!open) setMintRosterError(null)
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
                    isSubmitting={mintRosterMutation.isPending}
                    error={mintRosterError}
                    onSubmit={(values) => mintRosterMutation.mutate(values)}
                  />
                </DialogContent>
              </Dialog>

              <Dialog
                open={linkRosterDialogOpen}
                onOpenChange={(open) => {
                  setLinkRosterDialogOpen(open)
                  if (!open) setLinkRosterError(null)
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
                    isSubmitting={linkRosterMutation.isPending}
                    error={linkRosterError}
                    onSubmit={(values) => linkRosterMutation.mutate(values)}
                  />
                </DialogContent>
              </Dialog>
            </>
          )}
        </>
      )}

      {isPending ? (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          Saving changes…
        </p>
      ) : null}
    </main>
  )
}
