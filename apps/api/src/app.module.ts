import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { AppClsModule } from './common/cls/cls.module.js'
import { TrpcModule } from './common/trpc/trpc.module.js'
import { HealthController } from './common/health/health.controller.js'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AppClsModule,
    TrpcModule,
    // Domain modules are added in Task 10
  ],
  controllers: [HealthController],
})
export class AppModule {}
