import { Global, Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PgBossService } from './pg-boss.service'

@Global()
@Module({
  providers: [
    {
      provide: PgBossService,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.getOrThrow<string>('DATABASE_URL')
        return new PgBossService(url)
      },
    },
  ],
  exports: [PgBossService],
})
export class PgBossModule {}
