import { Module, Global } from '@nestjs/common'
import { ClsModule } from 'nestjs-cls'
import { TenantContextService } from './tenant-context.service'

@Global()
@Module({
  imports: [
    ClsModule.forRoot({
      global: true,
      middleware: {
        mount: true,
        setup: (cls, req) => {
          const rawTenantId = req.headers?.['x-future-tenant-id']
          const tenantId = Array.isArray(rawTenantId) ? rawTenantId[0] : rawTenantId
          if (tenantId) {
            cls.set('tenantId', tenantId)
          }

          const rawActorId = req.headers?.['x-future-actor-id']
          const actorId = Array.isArray(rawActorId) ? rawActorId[0] : rawActorId
          if (actorId) {
            cls.set('actorId', actorId)
          }
        },
      },
    }),
  ],
  providers: [TenantContextService],
  exports: [TenantContextService],
})
export class AppClsModule {}
