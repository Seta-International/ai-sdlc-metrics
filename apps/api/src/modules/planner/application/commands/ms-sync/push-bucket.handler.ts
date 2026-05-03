import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { Inject } from '@nestjs/common'
import {
  BUCKET_REPOSITORY,
  type IBucketRepository,
} from '../../../domain/repositories/bucket.repository'
import { PLAN_REPOSITORY, type IPlanRepository } from '../../../domain/repositories/plan.repository'
import { MsGraphClient } from '../../../infrastructure/ms-graph/ms-graph-client'
import { PushBucketCommand } from './push-bucket.command'

/** Sanitize an orderHint before sending to MS Planner.
 *  - '!' at index 0 is rejected by MS; clamp to the minimum valid hint ' !'.
 *  - ASCII 91-96 ([, \, ], ^, _, `) sort after lowercase letters in locale-sensitive
 *    collations but before them bytewise, causing divergent ordering; replace with 'a'.
 *  - MS Graph requires orderHints to contain at least one space or '!'; append ' !' if
 *    neither is present after the replacements above. */
function normalizeOrderHint(hint: string): string {
  if (hint.charCodeAt(0) === 33) return ' !'
  // eslint-disable-next-line no-control-regex
  const normalized = hint.replace(/[\x5b-\x60]/g, 'a')
  return /[ !]/.test(normalized) ? normalized : normalized + ' !'
}

@CommandHandler(PushBucketCommand)
export class PushBucketHandler implements ICommandHandler<PushBucketCommand> {
  constructor(
    @Inject(BUCKET_REPOSITORY) private readonly bucketRepo: IBucketRepository,
    @Inject(PLAN_REPOSITORY) private readonly planRepo: IPlanRepository,
    private readonly graph: MsGraphClient,
  ) {}

  async execute(command: PushBucketCommand): Promise<void> {
    const bucket = await this.bucketRepo.findById(command.bucketId, command.tenantId)
    if (!bucket) return

    const plan = await this.planRepo.findById(bucket.planId, command.tenantId)
    if (!plan || plan.container.type === 'future_only' || !plan.msPlanId) return

    // MS rejects orderHints that start with '!' (ASCII 33) at index 0.
    // Also normalise chars in the ASCII 91-96 zone ([, \, ], ^, _, `) to 'a' (97):
    // these sort after lowercase letters in locale-sensitive collations but before them
    // in bytewise order, causing divergent ordering between local DB and MS Planner.
    const safeOrderHint = normalizeOrderHint(bucket.orderHint)

    if (!bucket.msBucketId) {
      const res = await this.graph.post<Record<string, unknown>>(
        command.tenantId,
        '/planner/buckets',
        {
          name: bucket.name,
          planId: plan.msPlanId,
          orderHint: safeOrderHint,
        },
        { preferReturnRepresentation: true },
      )
      if (!res.body?.id) throw new Error('plannerBucket create returned no id')
      await this.bucketRepo.linkToMs(bucket.id, command.tenantId, {
        msBucketId: res.body.id as string,
        msBucketEtag: (res.body['@odata.etag'] as string | undefined) ?? res.etag ?? '',
        origin: 'ms-sync-push',
        orderHint: res.body.orderHint as string | undefined,
      })
      return
    }

    if (!bucket.msBucketEtag) return // can't PATCH without If-Match

    const res = await this.graph.patch<Record<string, unknown>>(
      command.tenantId,
      `/planner/buckets/${encodeURIComponent(bucket.msBucketId)}`,
      { name: bucket.name, orderHint: safeOrderHint },
      { ifMatch: bucket.msBucketEtag, preferReturnRepresentation: true },
    )
    const newEtag = (res.body?.['@odata.etag'] as string | undefined) ?? res.etag ?? ''
    if (newEtag) {
      await this.bucketRepo.linkToMs(bucket.id, command.tenantId, {
        msBucketId: bucket.msBucketId,
        msBucketEtag: newEtag,
        origin: 'ms-sync-push',
        orderHint: res.body?.orderHint as string | undefined,
      })
    }
  }
}
