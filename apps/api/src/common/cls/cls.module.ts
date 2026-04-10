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
          const rawTenantId = req.headers?.['x-tenant-id']
          const tenantId = Array.isArray(rawTenantId) ? rawTenantId[0] : rawTenantId
          if (tenantId) {
            cls.set('tenantId', tenantId)
          }
        },
      },
    }),
  ],
  providers: [TenantContextService],
  exports: [TenantContextService],
})
export class AppClsModule {}
