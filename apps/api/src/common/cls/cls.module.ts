import { Module, Global } from '@nestjs/common'
import { ClsModule } from 'nestjs-cls'

@Global()
@Module({
  imports: [
    ClsModule.forRoot({
      global: true,
      middleware: {
        mount: true,
        setup: (cls, req) => {
          // TODO: extract tenantId + actorId from session cookie
          // and call cls.set('tenantId', tenantId) here
        },
      },
    }),
  ],
})
export class AppClsModule {}
