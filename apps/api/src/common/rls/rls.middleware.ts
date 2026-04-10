import { Inject, Injectable, type NestMiddleware } from '@nestjs/common'
import { createDb, type Db } from '@future/db'
import { TenantContextService } from '../cls/tenant-context.service'
import { BASE_DB_TOKEN } from '../db/db.module'
import { RequestDbContextService } from '../db/request-db-context.service'

type ResponseLike = {
  once(event: 'finish' | 'close', listener: () => void): unknown
}

@Injectable()
export class RlsMiddleware implements NestMiddleware {
  constructor(
    @Inject(BASE_DB_TOKEN) private readonly baseDb: Db,
    private readonly tenantContext: TenantContextService,
    private readonly requestDbContext: RequestDbContextService,
  ) {}

  async use(_req: unknown, res: ResponseLike, next: () => void): Promise<void> {
    let tenantId: string

    try {
      tenantId = this.tenantContext.getTenantId()
    } catch {
      // Public routes may not have tenant context. Protected queries still scope by tenant_id.
      next()
      return
    }

    const client = await this.baseDb.$client.connect()

    try {
      await client.query("SELECT set_config('app.tenant_id', $1, false)", [tenantId])
      this.requestDbContext.setDb(createDb(client))
    } catch (error) {
      client.release()
      throw error
    }

    let cleanedUp = false
    const cleanup = async (): Promise<void> => {
      if (cleanedUp) {
        return
      }

      cleanedUp = true
      this.requestDbContext.clearDb()

      try {
        await client.query('RESET app.tenant_id')
      } finally {
        client.release()
      }
    }

    res.once('finish', () => {
      void cleanup()
    })
    res.once('close', () => {
      void cleanup()
    })

    next()
  }
}
