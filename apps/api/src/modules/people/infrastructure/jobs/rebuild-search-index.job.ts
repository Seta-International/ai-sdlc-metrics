import { Injectable, Logger } from '@nestjs/common'
import { SearchIndexRebuildService } from '../../application/services/search-index-rebuild.service'

export const REBUILD_SEARCH_INDEX_JOB = 'people.rebuild-search-index'

export interface RebuildSearchIndexPayload {
  tenantId: string
  employmentId?: string // if provided, rebuild single; otherwise full rebuild
}

@Injectable()
export class RebuildSearchIndexJob {
  private readonly logger = new Logger(RebuildSearchIndexJob.name)

  constructor(private readonly rebuildService: SearchIndexRebuildService) {}

  async handle(payload: RebuildSearchIndexPayload): Promise<void> {
    if (payload.employmentId) {
      this.logger.log(`Rebuilding search index for employment ${payload.employmentId}`)
      await this.rebuildService.rebuildForEmployment(payload.employmentId, payload.tenantId)
    } else {
      this.logger.log(`Full search index rebuild for tenant ${payload.tenantId}`)
      await this.rebuildService.rebuildAllForTenant(payload.tenantId)
    }
  }
}
