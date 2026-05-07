import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { router, publicProcedure } from '../../../../common/trpc/trpc-init'
import { PERMISSIONS } from '../../../../common/auth/permissions'
import type { KbRetriever } from '../../infrastructure/retrieval/kb-retriever'
import type { S3StorageClient } from '@future/storage'
import { agentKbDocument } from '../../infrastructure/schema/agents.schema'
import { desc, eq } from 'drizzle-orm'
import type { Db } from '@future/db'
import type { PgBossService } from '../../../../common/jobs/pg-boss.service'

let _retriever: KbRetriever
let _storage: S3StorageClient
let _db: Db
let _pgBoss: PgBossService

export function setKbHandlers(
  retriever: KbRetriever,
  storage: S3StorageClient,
  db: Db,
  pgBoss: PgBossService,
): void {
  _retriever = retriever
  _storage = storage
  _db = db
  _pgBoss = pgBoss
}

const MAX_FILE_BYTES = 5 * 1024 * 1024
const PRESIGNED_TTL_SEC = 600

export const kbRouter = router({
  requestUpload: publicProcedure
    .input(
      z.object({
        title: z.string().min(1).max(200),
        description: z.string().max(1000).optional(),
        fileSizeBytes: z.number().int().positive(),
        contentType: z.enum(['text/plain', 'text/markdown', 'application/pdf']),
        fileName: z.string().min(1),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.tenantId || !ctx.actorId) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Missing tenant context' })
      }
      if (input.fileSizeBytes > MAX_FILE_BYTES) {
        throw new Error(`File exceeds 5 MB limit`)
      }
      const s3Key = `kb/${ctx.tenantId}/${Date.now()}-${input.fileName}`
      const docs = await _db
        .insert(agentKbDocument)
        .values({
          tenantId: ctx.tenantId!,
          title: input.title,
          description: input.description ?? null,
          s3Key,
          status: 'pending',
          fileSizeBytes: input.fileSizeBytes,
          createdBy: ctx.actorId!,
        })
        .returning({ id: agentKbDocument.id })
      const documentId = docs[0]!.id
      const { url } = await _storage.getUploadUrl(s3Key, {
        contentType: input.contentType,
        expiresIn: PRESIGNED_TTL_SEC,
        maxSizeBytes: MAX_FILE_BYTES,
      })
      return { documentId, presignedUrl: url }
    }),

  confirmUpload: publicProcedure
    .input(z.object({ documentId: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.tenantId) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Missing tenant context' })
      }
      await _db
        .update(agentKbDocument)
        .set({ status: 'processing' })
        .where(eq(agentKbDocument.id, input.documentId))
      await _pgBoss.enqueue('kb-ingestion', {
        documentId: input.documentId,
        tenantId: ctx.tenantId!,
      })
      return { ok: true }
    }),

  listDocuments: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.tenantId) {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Missing tenant context' })
    }
    return _db
      .select()
      .from(agentKbDocument)
      .where(eq(agentKbDocument.tenantId, ctx.tenantId!))
      .orderBy(desc(agentKbDocument.createdAt))
  }),

  retrieve: publicProcedure
    .meta({
      permission: PERMISSIONS.AGENT_KB_RETRIEVE,
      agent: {
        whenToUse:
          'Use when the user asks about company policies, HR rules, onboarding procedures, internal FAQs, or any question whose answer is likely in a tenant-curated reference document.',
        whenNotToUse:
          'Do not use for questions about live operational data (tasks, plans, timesheets). Do not use when the answer is derivable from structured domain data alone.',
        examples: [
          {
            input: 'What is our parental leave policy?',
            callArgs: { query: 'parental leave policy' },
          },
          {
            input: 'How many days of annual leave do I have left?',
            callArgs: { query: 'annual leave days remaining' },
          },
        ],
        cacheable: { ttlSeconds: 300 },
      },
    })
    .input(z.object({ query: z.string().min(1).max(1000) }))
    .query(async ({ input }) => {
      return _retriever.retrieve(input.query)
    }),
})
