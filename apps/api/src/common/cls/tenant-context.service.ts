import { Injectable } from '@nestjs/common'
import { ClsService } from 'nestjs-cls'

const TENANT_ID_KEY = 'tenantId'

@Injectable()
export class TenantContextService {
  constructor(private readonly cls: ClsService) {}

  getTenantId(): string {
    const tenantId = this.cls.get<string>(TENANT_ID_KEY)
    if (!tenantId) {
      throw new Error(
        'TenantContextService: tenantId not set. Ensure RLS middleware ran before this call.',
      )
    }

    return tenantId
  }

  setTenantId(tenantId: string): void {
    this.cls.set(TENANT_ID_KEY, tenantId)
  }
}
