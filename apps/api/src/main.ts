import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify'
import { runMigrations } from '@future/db/migrate'
import { AppModule } from './app.module'

async function bootstrap() {
  await runMigrations()

  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter())

  const port = parseInt(process.env['PORT'] ?? '4000', 10)
  await app.listen(port, '0.0.0.0')
  console.log(`API listening on :${port}`)
}

bootstrap().catch((err) => {
  console.error('Bootstrap failed:', err)
  process.exit(1)
})
