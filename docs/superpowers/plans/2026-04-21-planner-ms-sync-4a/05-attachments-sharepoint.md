# Plan 4.5 — Attachments (SharePoint Round-Trip)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Full round-trip of Planner task attachments. Files attached in Future upload to the Group's SharePoint drive then registered as `taskDetails.references` on MS. Files attached in MS download from SharePoint to S3 and appear as Future attachments. Roster-container plans gracefully degrade to `not_syncable`.

**Architecture:** New `MsSharePointClient` thin-fetch wrapper over Graph `/sites`/`/drives`. `ms-sync-push-attachment` pg-boss job resolves Group site + drive, uploads (single PUT or createUploadSession chunked), then follow-up PATCH on `/planner/tasks/{id}/details` to register the reference. `ms-sync-pull-attachment` mirror job triggered during poll when a new reference is seen.

**Tech Stack:** native fetch, `@future/storage` (existing S3 client), pg-boss.

**Source spec:** [`2026-04-21-planner-ms-sync-4a-design.md`](../../specs/2026-04-21-planner-ms-sync-4a-design.md) §6.7, §10.2 (Plan 4.5).

**Depends on:** Plan 4.4 complete.

---

## Task 1: Feature flag + schema extensions

**Files:**

- Modify: feature-flag seed — add `planner.ms_sync.attachments.enabled` default `true` when parent flag on.
- Modify: `apps/api/src/modules/planner/infrastructure/schema/planner.schema.ts`
- Generate: migration

- [ ] **Step 1: Schema — extend `task_attachment`**

```typescript
// Add to existing task_attachment table
msReferenceUrl: text('ms_reference_url'),
msSharepointDriveId: text('ms_sharepoint_drive_id'),
msSharepointItemId: text('ms_sharepoint_item_id'),
msSyncState: text('ms_sync_state').notNull().default('synced'),
  // 'synced' | 'pending_upload' | 'pending_download' | 'not_syncable'
```

Default `'synced'` for existing rows (Future-only plans have no sync concerns). New attachments on MS-linked plans are created with `'pending_upload'`; reconciled by the upload worker.

- [ ] **Step 2: Generate migration + RLS unchanged (table already has tenant_id)**

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(planner): task_attachment ms_sync fields + attachments feature flag"
```

---

## Task 2: `MsSharePointClient` — thin Graph client for drives API

**Files:**

- Create: `apps/api/src/modules/planner/infrastructure/ms-graph/ms-sharepoint-client.ts` (+ `.spec.ts`)

Responsibilities:

- `getGroupDefaultDriveId(tenantId, msGroupId) → { siteId, driveId }`
- `ensureFolder(tenantId, driveId, folderPath) → { itemId }`
- `uploadSmall(tenantId, driveId, path, body, mimeType) → { webUrl, itemId, driveId }`
- `createUploadSession(tenantId, driveId, path) → { uploadUrl }`
- `uploadChunk(uploadUrl, bytes, range, totalSize) → { status, webUrl?, itemId?, driveId? }`
- `downloadContent(tenantId, driveId, itemId) → ReadableStream`
- `getItemMetadata(tenantId, driveId, itemId) → { name, size, mimeType }`

- [ ] **Step 1: Skeleton + happy-path tests**

```typescript
describe('MsSharePointClient', () => {
  it('getGroupDefaultDriveId: calls /groups/{id}/sites/root then /sites/{id}/drive', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'site-1' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'drive-1' }) })
    const c = new MsSharePointClient(identityFacade, tokenAcquirer)
    const r = await c.getGroupDefaultDriveId('t1', 'group-xyz')
    expect(r).toEqual({ siteId: 'site-1', driveId: 'drive-1' })
  })

  it('ensureFolder: 404 on GET → PUT to create', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 404, text: async () => '' })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'folder-id' }) })
    const c = new MsSharePointClient(identityFacade, tokenAcquirer)
    const r = await c.ensureFolder('t1', 'drive-1', '/Planner/MyPlan')
    expect(r.itemId).toBe('folder-id')
  })

  it('uploadSmall: PUT /drives/{id}/root:/path:/content with body', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'item-1',
        webUrl: 'https://sp/x',
        parentReference: { driveId: 'drive-1' },
      }),
    })
    const c = new MsSharePointClient(identityFacade, tokenAcquirer)
    const r = await c.uploadSmall(
      't1',
      'drive-1',
      '/Planner/MyPlan/file.pdf',
      Buffer.from('hello'),
      'application/pdf',
    )
    expect(r).toEqual({ itemId: 'item-1', webUrl: 'https://sp/x', driveId: 'drive-1' })
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/drives/drive-1/root:/Planner/MyPlan/file.pdf:/content'),
      expect.objectContaining({ method: 'PUT' }),
    )
  })

  it('createUploadSession: returns uploadUrl for large files', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ uploadUrl: 'https://sp/session', expirationDateTime: '...' }),
    })
    const c = new MsSharePointClient(identityFacade, tokenAcquirer)
    const { uploadUrl } = await c.createUploadSession('t1', 'drive-1', '/Planner/MyPlan/big.pdf')
    expect(uploadUrl).toBe('https://sp/session')
  })

  it('downloadContent: follows 302 redirect to direct download URL', async () => {
    /* ... */
  })
})
```

- [ ] **Step 2: Implementation**

```typescript
@Injectable()
export class MsSharePointClient {
  constructor(
    private readonly identityFacade: IdentityQueryFacade,
    private readonly tokenAcquirer: MsGraphTokenAcquirer,
  ) {}

  async getGroupDefaultDriveId(
    tenantId: string,
    msGroupId: string,
  ): Promise<{ siteId: string; driveId: string }> {
    const site = await this.graphFetch<any>(
      tenantId,
      `/groups/${encodeURIComponent(msGroupId)}/sites/root`,
    )
    const drive = await this.graphFetch<any>(
      tenantId,
      `/sites/${encodeURIComponent(site.id)}/drive`,
    )
    return { siteId: site.id, driveId: drive.id }
  }

  async ensureFolder(
    tenantId: string,
    driveId: string,
    folderPath: string,
  ): Promise<{ itemId: string }> {
    const encoded = folderPath.split('/').filter(Boolean).map(encodeURIComponent).join('/')
    try {
      const item = await this.graphFetch<any>(tenantId, `/drives/${driveId}/root:/${encoded}`)
      return { itemId: item.id }
    } catch (e: any) {
      if (!/404/.test(e.message)) throw e
    }
    // Create parent folders if missing (walk up)
    const segments = folderPath.split('/').filter(Boolean)
    let parentRef = 'root'
    let currentPath = ''
    for (const seg of segments) {
      currentPath = currentPath ? `${currentPath}/${seg}` : seg
      try {
        const existing = await this.graphFetch<any>(
          tenantId,
          `/drives/${driveId}/root:/${encodeURIComponent(currentPath)}`,
        )
        parentRef = existing.id
      } catch {
        const created = await this.graphFetchJson<any>(
          tenantId,
          `/drives/${driveId}/items/${parentRef}/children`,
          {
            method: 'POST',
            body: JSON.stringify({
              name: seg,
              folder: {},
              '@microsoft.graph.conflictBehavior': 'replace',
            }),
            headers: { 'Content-Type': 'application/json' },
          },
        )
        parentRef = created.id
      }
    }
    return { itemId: parentRef }
  }

  async uploadSmall(
    tenantId: string,
    driveId: string,
    path: string,
    body: Uint8Array | Buffer,
    mimeType: string,
  ): Promise<{ itemId: string; webUrl: string; driveId: string }> {
    const encoded = path.split('/').filter(Boolean).map(encodeURIComponent).join('/')
    const url = `https://graph.microsoft.com/v1.0/drives/${driveId}/root:/${encoded}:/content`
    const token = await this.acquireToken(tenantId)
    const response = await fetch(url, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': mimeType },
      body,
    })
    if (!response.ok) throw new Error(`uploadSmall ${response.status}: ${await response.text()}`)
    const json = (await response.json()) as any
    return {
      itemId: json.id,
      webUrl: json.webUrl,
      driveId: json.parentReference?.driveId ?? driveId,
    }
  }

  async createUploadSession(
    tenantId: string,
    driveId: string,
    path: string,
  ): Promise<{ uploadUrl: string }> {
    const encoded = path.split('/').filter(Boolean).map(encodeURIComponent).join('/')
    const json = await this.graphFetchJson<any>(
      tenantId,
      `/drives/${driveId}/root:/${encoded}:/createUploadSession`,
      {
        method: 'POST',
        body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': 'replace' } }),
        headers: { 'Content-Type': 'application/json' },
      },
    )
    return { uploadUrl: json.uploadUrl as string }
  }

  async uploadChunk(
    uploadUrl: string,
    bytes: Uint8Array | Buffer,
    rangeStart: number,
    totalSize: number,
  ): Promise<{ status: number; itemId?: string; webUrl?: string; driveId?: string }> {
    const rangeEnd = rangeStart + bytes.length - 1
    const response = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Length': String(bytes.length),
        'Content-Range': `bytes ${rangeStart}-${rangeEnd}/${totalSize}`,
      },
      body: bytes,
    })
    if (response.status === 201 || response.status === 200) {
      const json = (await response.json()) as any
      return {
        status: response.status,
        itemId: json.id,
        webUrl: json.webUrl,
        driveId: json.parentReference?.driveId,
      }
    }
    if (response.status === 202) return { status: 202 } // continue
    throw new Error(`uploadChunk ${response.status}: ${await response.text()}`)
  }

  async downloadContent(
    tenantId: string,
    driveId: string,
    itemId: string,
  ): Promise<{ stream: ReadableStream; size: number; contentType: string }> {
    const token = await this.acquireToken(tenantId)
    const response = await fetch(
      `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${encodeURIComponent(itemId)}/content`,
      { headers: { Authorization: `Bearer ${token}` }, redirect: 'follow' },
    )
    if (!response.ok) throw new Error(`download ${response.status}: ${await response.text()}`)
    return {
      stream: response.body!,
      size: parseInt(response.headers.get('content-length') ?? '0', 10),
      contentType: response.headers.get('content-type') ?? 'application/octet-stream',
    }
  }

  async getItemMetadata(
    tenantId: string,
    driveId: string,
    itemId: string,
  ): Promise<{ name: string; size: number; mimeType: string }> {
    const item = await this.graphFetch<any>(
      tenantId,
      `/drives/${driveId}/items/${encodeURIComponent(itemId)}`,
    )
    return {
      name: item.name,
      size: item.size ?? 0,
      mimeType: item.file?.mimeType ?? 'application/octet-stream',
    }
  }

  private async acquireToken(tenantId: string): Promise<string> {
    const cred = await this.identityFacade.getGraphCredential(tenantId)
    if (!cred) throw new Error(`No credential for tenant ${tenantId}`)
    return this.tokenAcquirer.acquire(cred)
  }

  private async graphFetch<T>(tenantId: string, path: string): Promise<T> {
    const token = await this.acquireToken(tenantId)
    const response = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    })
    if (!response.ok) throw new Error(`Graph ${response.status}: ${await response.text()}`)
    return (await response.json()) as T
  }

  private async graphFetchJson<T>(tenantId: string, path: string, init: RequestInit): Promise<T> {
    const token = await this.acquireToken(tenantId)
    const headers = {
      ...(init.headers as Record<string, string>),
      Authorization: `Bearer ${token}`,
    }
    const response = await fetch(`https://graph.microsoft.com/v1.0${path}`, { ...init, headers })
    if (!response.ok) throw new Error(`Graph ${response.status}: ${await response.text()}`)
    return (await response.json()) as T
  }
}
```

- [ ] **Step 3: Run tests — expect PASS**

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(planner): MsSharePointClient for /sites and /drives"
```

---

## Task 3: Push-attachment worker — upload + PATCH references

**Files:**

- Create: `apps/api/src/modules/planner/application/commands/ms-sync/push-attachment.command.ts`
- Create: `apps/api/src/modules/planner/application/commands/ms-sync/push-attachment.handler.ts` (+ `.spec.ts`)

- [ ] **Step 1: Handler test**

```typescript
describe('PushAttachmentHandler', () => {
  it('roster-container plan → mark not_syncable and return', async () => {
    /* ... */
  })
  it('future_only plan → no-op', async () => {
    /* ... */
  })
  it('small file (<4MB) → uploadSmall then PATCH /details with reference', async () => {
    /* ... */
  })
  it('large file (≥4MB) → createUploadSession + chunked upload', async () => {
    /* ... */
  })
  it('on PATCH 412 → re-fetch details etag, retry once', async () => {
    /* ... */
  })
  it('on upload failure → mark pending_upload, throw for pg-boss retry', async () => {
    /* ... */
  })
})
```

- [ ] **Step 2: Handler implementation**

```typescript
const SMALL_FILE_THRESHOLD = 4 * 1024 * 1024
const CHUNK_SIZE = 5 * 1024 * 1024 // 5 MiB aligned to Graph's 320 KiB multiple requirement

@CommandHandler(PushAttachmentCommand)
export class PushAttachmentHandler implements ICommandHandler<PushAttachmentCommand> {
  constructor(
    @Inject(TASK_ATTACHMENT_REPOSITORY) private readonly attachmentRepo: ITaskAttachmentRepository,
    @Inject(TASK_REPOSITORY) private readonly taskRepo: ITaskRepository,
    @Inject(PLAN_REPOSITORY) private readonly planRepo: IPlanRepository,
    @Inject(MS_SYNC_CONFLICT_REPOSITORY) private readonly conflictRepo: IMsSyncConflictRepository,
    private readonly storage: StorageClient,
    private readonly sharepoint: MsSharePointClient,
    private readonly graph: MsGraphClient,
  ) {}

  async execute(command: PushAttachmentCommand): Promise<void> {
    const attachment = await this.attachmentRepo.get(command.attachmentId)
    if (!attachment || attachment.kind !== 'file') return
    if (attachment.msSyncState !== 'pending_upload') return

    const task = await this.taskRepo.get(attachment.taskId)
    if (!task) return
    const plan = await this.planRepo.get(task.planId)
    if (!plan) return
    if (plan.containerType === 'future_only') return
    if (plan.containerType === 'ms_roster') {
      await this.attachmentRepo.setSyncState(attachment.id, 'not_syncable')
      return
    }
    if (!plan.containerRef || !plan.msPlanId || !task.msTaskId || !task.msDetailsEtag) {
      return // dependencies not yet available; push-task will create them first
    }

    // Resolve SharePoint drive for the Group
    const { driveId } = await this.sharepoint.getGroupDefaultDriveId(
      command.tenantId,
      plan.containerRef,
    )
    const folderPath = `/Planner/${plan.title.replace(/[^A-Za-z0-9 _.-]/g, '_')}`
    await this.sharepoint.ensureFolder(command.tenantId, driveId, folderPath)
    const filePath = `${folderPath}/${attachment.filename}`

    // Stream from S3
    const s3Stream = await this.storage.getObjectStream(attachment.s3Key!)
    const fileSize = attachment.sizeBytes ?? 0

    let uploadResult: { itemId: string; webUrl: string; driveId: string }
    if (fileSize <= SMALL_FILE_THRESHOLD) {
      const body = await this.collectStreamToBuffer(s3Stream)
      uploadResult = await this.sharepoint.uploadSmall(
        command.tenantId,
        driveId,
        filePath,
        body,
        attachment.mimeType ?? 'application/octet-stream',
      )
    } else {
      const { uploadUrl } = await this.sharepoint.createUploadSession(
        command.tenantId,
        driveId,
        filePath,
      )
      uploadResult = await this.uploadInChunks(uploadUrl, s3Stream, fileSize)
    }

    // PATCH /planner/tasks/{id}/details to register the reference
    const encodedUrl = encodeURIComponent(uploadResult.webUrl)
    const referencesBody = {
      references: {
        [encodedUrl]: {
          '@odata.type': '#microsoft.graph.plannerExternalReference',
          alias: attachment.filename,
          type: this.inferReferenceType(attachment.mimeType ?? ''),
        },
      },
    }

    try {
      const res = await this.graph.patch<any>(
        command.tenantId,
        `/planner/tasks/${encodeURIComponent(task.msTaskId!)}/details`,
        referencesBody,
        { ifMatch: task.msDetailsEtag!, preferReturnRepresentation: true },
      )
      const newEtag = res.body?.['@odata.etag'] ?? res.etag
      if (newEtag) await this.taskRepo.updateEtag(task.id, { msDetailsEtag: newEtag })
    } catch (e) {
      if (e instanceof GraphPreconditionFailedError) {
        // Re-fetch and retry once
        const fresh = await this.graph.get<any>(
          command.tenantId,
          `/planner/tasks/${encodeURIComponent(task.msTaskId!)}/details`,
        )
        const freshEtag = fresh.body!['@odata.etag'] as string
        await this.graph.patch(
          command.tenantId,
          `/planner/tasks/${encodeURIComponent(task.msTaskId!)}/details`,
          referencesBody,
          { ifMatch: freshEtag, preferReturnRepresentation: true },
        )
      } else {
        throw e
      }
    }

    await this.attachmentRepo.markSynced(attachment.id, {
      msReferenceUrl: uploadResult.webUrl,
      msSharepointDriveId: uploadResult.driveId,
      msSharepointItemId: uploadResult.itemId,
      origin: 'ms-sync-push',
    })
  }

  private async uploadInChunks(
    uploadUrl: string,
    stream: ReadableStream,
    totalSize: number,
  ): Promise<{ itemId: string; webUrl: string; driveId: string }> {
    const reader = stream.getReader()
    let offset = 0
    let lastResult: Awaited<ReturnType<typeof this.sharepoint.uploadChunk>> | null = null
    const buffer: Uint8Array[] = []
    let bufferedSize = 0

    const flush = async (final: boolean) => {
      while (bufferedSize >= CHUNK_SIZE || (final && bufferedSize > 0)) {
        const chunk = this.takeChunk(buffer, Math.min(CHUNK_SIZE, bufferedSize))
        lastResult = await this.sharepoint.uploadChunk(uploadUrl, chunk, offset, totalSize)
        offset += chunk.length
        bufferedSize -= chunk.length
      }
    }

    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer.push(value)
      bufferedSize += value.length
      await flush(false)
    }
    await flush(true)

    if (!lastResult || lastResult.status === 202 || !lastResult.itemId) {
      throw new Error('chunked upload finished without completion response')
    }
    return { itemId: lastResult.itemId, webUrl: lastResult.webUrl!, driveId: lastResult.driveId! }
  }

  private takeChunk(buffer: Uint8Array[], bytes: number): Uint8Array {
    const out = new Uint8Array(bytes)
    let copied = 0
    while (copied < bytes) {
      const first = buffer[0]
      const remaining = bytes - copied
      if (first.length <= remaining) {
        out.set(first, copied)
        copied += first.length
        buffer.shift()
      } else {
        out.set(first.subarray(0, remaining), copied)
        buffer[0] = first.subarray(remaining)
        copied += remaining
      }
    }
    return out
  }

  private async collectStreamToBuffer(stream: ReadableStream): Promise<Buffer> {
    const chunks: Uint8Array[] = []
    const reader = stream.getReader()
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      chunks.push(value)
    }
    return Buffer.concat(chunks)
  }

  private inferReferenceType(mimeType: string): string {
    if (mimeType.includes('pdf')) return 'Pdf'
    if (mimeType.startsWith('image/')) return 'Image'
    if (mimeType.startsWith('video/')) return 'Video'
    if (mimeType.includes('word') || mimeType.includes('document')) return 'Word'
    if (mimeType.includes('sheet') || mimeType.includes('excel')) return 'Excel'
    return 'Other'
  }
}
```

- [ ] **Step 3: Repository methods**

Add to `ITaskAttachmentRepository`:

```typescript
setSyncState(id: string, state: 'synced' | 'pending_upload' | 'pending_download' | 'not_syncable'): Promise<void>
markSynced(id: string, input: { msReferenceUrl: string; msSharepointDriveId: string; msSharepointItemId: string; origin: string }): Promise<void>
```

Implement + integration-test.

- [ ] **Step 4: Run tests**

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(planner): push-attachment worker with SharePoint upload + references PATCH"
```

---

## Task 4: Pull-attachment worker — download + S3 upload

**Files:**

- Create: `apps/api/src/modules/planner/application/commands/ms-sync/pull-attachment.command.ts`
- Create: `apps/api/src/modules/planner/application/commands/ms-sync/pull-attachment.handler.ts` (+ `.spec.ts`)

The `PlanIngestor` (Plan 4.2) upserts `task_attachment` rows as `pending_download` when it sees a new reference URL. This worker fulfills them.

- [ ] **Step 1: Handler**

```typescript
@CommandHandler(PullAttachmentCommand)
export class PullAttachmentHandler implements ICommandHandler<PullAttachmentCommand> {
  constructor(
    @Inject(TASK_ATTACHMENT_REPOSITORY) private readonly attachmentRepo: ITaskAttachmentRepository,
    private readonly sharepoint: MsSharePointClient,
    private readonly storage: StorageClient,
  ) {}

  async execute(command: PullAttachmentCommand): Promise<void> {
    const attachment = await this.attachmentRepo.get(command.attachmentId)
    if (!attachment || attachment.msSyncState !== 'pending_download') return
    if (!attachment.msSharepointDriveId || !attachment.msSharepointItemId) {
      // Reference URL present but drive/item not resolved yet
      const parsed = parseSharePointUrl(attachment.msReferenceUrl!)
      if (!parsed) {
        await this.attachmentRepo.setSyncState(attachment.id, 'not_syncable')
        return
      }
      // graph-resolve driveId + itemId from URL
      // (for MVP we parse known patterns; fall back to siteId+relative path)
    }

    const { stream, size, contentType } = await this.sharepoint.downloadContent(
      command.tenantId,
      attachment.msSharepointDriveId!,
      attachment.msSharepointItemId!,
    )

    const s3Key = `tenants/${command.tenantId}/attachments/${attachment.id}`
    await this.storage.putObjectStream(s3Key, stream, { contentType, size })

    await this.attachmentRepo.markDownloaded(attachment.id, {
      s3Key,
      sizeBytes: size,
      mimeType: contentType,
      origin: 'ms-sync-pull',
    })
  }
}
```

`parseSharePointUrl` is a small pure helper that attempts to pull site / drive / item IDs from known SharePoint URL patterns. If it can't, mark the attachment `not_syncable` and continue.

- [ ] **Step 2: Tests**

- [ ] **Step 3: `PlanIngestor` extension**

In Plan 4.2's `PlanIngestor`, in the taskDetails upsert step, iterate references. For each reference URL missing a corresponding `task_attachment`, insert a row with `kind='file', msSyncState='pending_download', msReferenceUrl=<url>` and enqueue `ms-sync-pull-attachment`.

For each local `task_attachment` with `msReferenceUrl` no longer present in MS's references, soft-delete the attachment locally.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(planner): pull-attachment worker — SharePoint download → S3"
```

---

## Task 5: Attachment command — user attaches file in web-planner

**Files:**

- Modify: `apps/api/src/modules/planner/application/commands/task-attachment/create-task-attachment.handler.ts` (existing from Sub-project #1)

- [ ] **Step 1: Extend handler**

After writing the `task_attachment` row and uploading to S3, check the parent plan's `containerType`:

- `future_only` → existing flow (no sync).
- `ms_group` → set `msSyncState='pending_upload'`; emit `TaskAttachmentCreatedEvent` with `changedFields: ['attachments']` and `origin: 'user'`; listener enqueues push-attachment.
- `ms_roster` → set `msSyncState='not_syncable'`; no sync activity.

- [ ] **Step 2: Tests — all three branches**

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(planner): new attachments on MS-linked plans mark pending_upload"
```

---

## Task 6: Nightly retry cron for failed uploads/downloads

**Files:**

- Create: `apps/api/src/modules/planner/infrastructure/jobs/ms-sync-retry-attachments.registrar.ts`
- Create: `apps/api/src/modules/planner/application/commands/ms-sync/retry-pending-attachments.command.ts` (+ handler)

- [ ] **Step 1: Scheduled pg-boss cron** — once nightly at 03:00 UTC per tenant with active credential.

- [ ] **Step 2: Handler** — find `task_attachment` rows with `msSyncState IN ('pending_upload','pending_download')` older than 30 min; re-enqueue appropriate push/pull job.

- [ ] **Step 3: Tests**

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(planner): nightly retry for pending attachment uploads/downloads"
```

---

## Task 7: Admin kill-switch + UX

**Files:**

- Modify: `apps/web-admin/src/app/integrations/microsoft/page.tsx` (or the Linked Groups table from Plan 4.2)
- Modify: `MsSyncPushListener` — skip attachment events when `attachments.enabled=false`

- [ ] **Step 1: Flag check in listener**

The attachment-enqueue branch in `MsSyncPushListener` first reads the feature flag. If off, the event is not enqueued. New attachments on MS-linked plans still land in Future as `pending_upload`, but never upload.

- [ ] **Step 2: Banner in web-admin** — when flag off + any `pending_upload` rows exist: "Attachment sync is disabled by SETA. Existing files remain downloadable; new files stay in Future."

- [ ] **Step 3: Tests for the flag-gated path**

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(planner): attachments kill-switch flag + admin banner"
```

---

## Task 8: Task card / detail panel — sync state badges

**Files:**

- Modify: `apps/web-planner/src/components/task-card/task-card.tsx`
- Modify: `apps/web-planner/src/components/task-detail/attachment-list.tsx`

- [ ] **Step 1: Small badge on task card** when the task has any attachment with `ms_sync_state='pending_upload'`: "Attachment pending upload" badge with `status/warning` token.

- [ ] **Step 2: Per-attachment status in detail panel**:
- `synced` — no badge.
- `pending_upload` — spinner + "Uploading to Microsoft 365".
- `pending_download` — spinner + "Downloading from Microsoft 365".
- `not_syncable` — gray badge "Stays in Future" with tooltip explaining why.

- [ ] **Step 3: Tests**

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(web-planner): attachment sync state badges"
```

---

## Task 9: Coverage + PR

- [ ] **Step 1: Coverage ≥ 70%**

- [ ] **Step 2: E2E smoke**

1. Attach a 100 KB PDF to a Future task on an MS-linked plan → within 10 s, file is present in SharePoint and reference shown in MS Planner web UI.
2. Attach a file in MS Planner → within 3 min, file shows in Future task's attachments (downloaded to S3).
3. Flip `attachments.enabled` off → new Future attachments stay local; existing synced ones still work.

- [ ] **Step 3: PR** — `feat/planner-ms-sync-attachments`

## Completion criteria

- `MsSharePointClient` with uploadSmall / createUploadSession / downloadContent.
- Push-attachment worker uploads Future files to SharePoint and registers reference.
- Pull-attachment worker downloads SharePoint files to S3.
- Roster-container plans mark attachments `not_syncable`.
- Kill-switch flag + admin banner.
- Task card + detail panel show sync state.
- Nightly retry cron for pending attachments.
- Coverage ≥ 70%.
- E2E round-trip validated.
