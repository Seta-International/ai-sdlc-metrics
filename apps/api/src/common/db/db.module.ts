import { Global, Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createDb, type Db } from '@future/db'

export const DB_TOKEN = Symbol('Db')

@Global()
@Module({
  providers: [
    {
      provide: DB_TOKEN,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Db => {
        const url = config.getOrThrow<string>('DATABASE_URL')
        return createDb(url)
      },
    },
  ],
  exports: [DB_TOKEN],
})
export class DbModule {}
