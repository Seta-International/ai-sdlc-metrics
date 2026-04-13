import { z } from 'zod'
import { router, publicProcedure } from '../../../../common/trpc/trpc-init'
import type { AuthContext } from '../../../../common/trpc/auth-middleware'
import { DocumentsRouterService } from './documents-router.service'
import { GenerateDocumentCommand } from '../../application/commands/generate-document.command'
import { CreateTemplateCommand } from '../../application/commands/create-template.command'
import { UpdateBrandingCommand } from '../../application/commands/update-branding.command'
import { ListTemplatesQuery } from '../../application/queries/list-templates.query'
import { ListGenerationJobsQuery } from '../../application/queries/list-generation-jobs.query'
import { GetGenerationJobQuery } from '../../application/queries/get-generation-job.query'
import { GetJobDownloadUrlQuery } from '../../application/queries/get-job-download-url.query'
import { GetTemplateByIdQuery } from '../../application/queries/get-template-by-id.query'
import { GetBrandingQuery } from '../../application/queries/get-branding.query'

function svc() {
  return DocumentsRouterService.getInstance()
}

const templateFormatEnum = z.enum(['pdf', 'excel'])
const jobStatusEnum = z.enum(['pending', 'processing', 'completed', 'failed'])

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createDocumentsRouter(protectedProcedure: any) {
  return router({
    templates: router({
      list: protectedProcedure
        .input(z.object({ format: templateFormatEnum.optional() }))
        .query(({ ctx, input }: { ctx: AuthContext; input: { format?: 'pdf' | 'excel' } }) =>
          svc().query(new ListTemplatesQuery(ctx.tenantId, { format: input.format })),
        ),

      get: protectedProcedure
        .input(z.object({ id: z.string().uuid() }))
        .query(({ ctx, input }: { ctx: AuthContext; input: { id: string } }) =>
          svc().query(new GetTemplateByIdQuery(ctx.tenantId, input.id)),
        ),

      create: protectedProcedure
        .input(
          z.object({
            slug: z.string().min(1).max(100),
            name: z.string().min(1).max(200),
            format: templateFormatEnum,
            content: z.string().min(1),
          }),
        )
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .mutation(({ ctx, input }: { ctx: AuthContext; input: any }) =>
          svc().command(
            new CreateTemplateCommand(
              ctx.tenantId,
              ctx.actorId,
              input.slug,
              input.name,
              input.format,
              input.content,
            ),
          ),
        ),
    }),

    branding: router({
      get: protectedProcedure.query(({ ctx }: { ctx: AuthContext }) =>
        svc().query(new GetBrandingQuery(ctx.tenantId)),
      ),

      update: protectedProcedure
        .input(
          z.object({
            companyName: z.string().min(1).max(200),
            logoFileKey: z.string().nullable().optional(),
            primaryColor: z
              .string()
              .regex(/^#[0-9A-Fa-f]{6}$/)
              .nullable()
              .optional(),
            fontFamily: z.string().nullable().optional(),
          }),
        )
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .mutation(({ ctx, input }: { ctx: AuthContext; input: any }) =>
          svc().command(
            new UpdateBrandingCommand(
              ctx.tenantId,
              input.companyName,
              input.logoFileKey ?? null,
              input.primaryColor ?? null,
              input.fontFamily ?? null,
            ),
          ),
        ),
    }),

    generate: protectedProcedure
      .input(
        z.object({
          templateSlug: z.string().min(1),
          inputData: z.record(z.string(), z.unknown()),
        }),
      )
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mutation(({ ctx, input }: { ctx: AuthContext; input: any }) =>
        svc().command(
          new GenerateDocumentCommand(
            ctx.tenantId,
            ctx.actorId,
            input.templateSlug,
            input.inputData,
          ),
        ),
      ),

    jobs: router({
      list: protectedProcedure
        .input(z.object({ status: jobStatusEnum.optional() }))
        .query(
          ({
            ctx,
            input,
          }: {
            ctx: AuthContext
            input: { status?: 'pending' | 'processing' | 'completed' | 'failed' }
          }) => svc().query(new ListGenerationJobsQuery(ctx.tenantId, { status: input.status })),
        ),

      getDownloadUrl: protectedProcedure
        .input(z.object({ jobId: z.string().uuid() }))
        .query(({ ctx, input }: { ctx: AuthContext; input: { jobId: string } }) =>
          svc().query(new GetJobDownloadUrlQuery(ctx.tenantId, input.jobId)),
        ),
    }),
  })
}

// Static default for type inference — replaced at runtime by TrpcModule
export const documentsRouter = router({
  templates: router({
    list: publicProcedure.input(z.object({})).query(() => []),
    get: publicProcedure.input(z.object({})).query(() => null),
    create: publicProcedure.input(z.object({})).mutation(() => null),
  }),
  branding: router({
    get: publicProcedure.query(() => null),
    update: publicProcedure.input(z.object({})).mutation(() => null),
  }),
  generate: publicProcedure.input(z.object({})).mutation(() => null),
  jobs: router({
    list: publicProcedure.input(z.object({})).query(() => []),
    getDownloadUrl: publicProcedure.input(z.object({})).query(() => null),
  }),
})
