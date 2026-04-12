import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify'
import { fastifyTRPCPlugin, type FastifyTRPCPluginOptions } from '@trpc/server/adapters/fastify'
import { runMigrations } from '@future/db/migrate'
import { AppModule } from './app.module'
import { getAppRouter, type AppRouter } from './common/trpc/app-router'
import { buildRequestIdentity } from './common/trpc/context'

async function bootstrap() {
  await runMigrations()

  const adapter = new FastifyAdapter()
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter)

  // Mount tRPC on the raw Fastify instance before listen.
  // NestFactory.create initializes all modules (including TrpcModule.onModuleInit),
  // so getAppRouter() returns the permission-wired router at this point.
  const fastify = adapter.getInstance()
  await fastify.register(fastifyTRPCPlugin, {
    prefix: '/trpc',
    trpcOptions: {
      router: getAppRouter(),
      createContext: ({ req }) => ({
        req: { headers: { cookie: req.headers.cookie } },
        ...buildRequestIdentity({ headers: req.headers as Record<string, unknown> }),
      }),
      onError({ path, error }) {
        console.error(`tRPC error on '${path}':`, error)
      },
    } satisfies FastifyTRPCPluginOptions<AppRouter>['trpcOptions'],
  })

  const port = parseInt(process.env['PORT'] ?? '4000', 10)
  await app.listen(port, '0.0.0.0')
  console.log(`API listening on :${port}`)
}

bootstrap().catch((err) => {
  console.error('Bootstrap failed:', err)
  process.exit(1)
})
