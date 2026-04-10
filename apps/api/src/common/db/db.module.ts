import { Global, Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createDb, type Db } from '@future/db'
import { AppClsModule } from '../cls/cls.module'
import { RequestDbContextService } from './request-db-context.service'
import { createRequestBoundDbProxy } from './request-db.proxy'

export const DB_TOKEN = Symbol('Db')
export const BASE_DB_TOKEN = Symbol('BaseDb')

@Global()
@Module({
  imports: [AppClsModule],
  providers: [
    {
      provide: BASE_DB_TOKEN,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Db => {
        const url = config.getOrThrow<string>('DATABASE_URL')
        return createDb(url)
      },
    },
    RequestDbContextService,
    {
      provide: DB_TOKEN,
      inject: [BASE_DB_TOKEN, RequestDbContextService],
      useFactory: (baseDb: Db, requestDbContext: RequestDbContextService): Db =>
        createRequestBoundDbProxy(baseDb, () => requestDbContext.getDb()),
    },
  ],
  exports: [BASE_DB_TOKEN, DB_TOKEN, RequestDbContextService],
})
export class DbModule {}
