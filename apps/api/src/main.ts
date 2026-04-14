import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { Logger } from '@nestjs/common'
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify'
import { fastifyTRPCPlugin, type FastifyTRPCPluginOptions } from '@trpc/server/adapters/fastify'
import { runMigrations } from '@future/db/migrate'
import { AppModule } from './app.module'
import { getAppRouter, type AppRouter } from './common/trpc/app-router'
import { buildRequestIdentity } from './common/trpc/context'

const logger = new Logger('Bootstrap')

async function bootstrap() {
  await runMigrations()

  const adapter = new FastifyAdapter()
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, {
    logger: ['error', 'warn', 'log', 'debug'],
  })

  // Allow cross-origin requests from web zones (ports 3000-3011 in dev,
  // configurable via CORS_ORIGIN in production).
  const allowedOrigin = process.env['CORS_ORIGIN'] ?? /^https?:\/\/localhost:\d+$/
  app.enableCors({
    origin: allowedOrigin,
    credentials: true,
  })

  // Initialize all modules (calls onModuleInit lifecycle hooks)
  // before registering the tRPC plugin which needs the initialized router.
  await app.init()

  // Mount tRPC on the raw Fastify instance before listen.
  // app.init() above has called TrpcModule.onModuleInit, so getAppRouter() returns
  // the permission-wired router at this point.
  const fastify = adapter.getInstance()
  await fastify.register(fastifyTRPCPlugin, {
    prefix: '/trpc',
    trpcOptions: {
      router: getAppRouter(),
      createContext: ({ req }) => ({
        req: { headers: { cookie: req.headers.cookie } },
        ...buildRequestIdentity({
          headers: req.headers as Record<string, unknown>,
          environment: process.env['NODE_ENV'],
        }),
      }),
      onError({ path, error }) {
        logger.error(`tRPC error on '${path}': ${error.message}`, error.stack)
      },
    } satisfies FastifyTRPCPluginOptions<AppRouter>['trpcOptions'],
  })

  const port = parseInt(process.env['PORT'] ?? '4000', 10)
  await app.listen(port, '0.0.0.0')
  logger.log(`API listening on :${port}`)
}

bootstrap().catch((err: unknown) => {
  logger.error('Bootstrap failed', err instanceof Error ? err.stack : String(err))
  process.exit(1)
})
