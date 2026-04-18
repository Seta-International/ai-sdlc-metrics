import { router } from '../../../../common/trpc/trpc-init'
import { planRouter } from './plan.router'
import { labelRouter } from './label.router'
import { bucketRouter } from './bucket.router'

export const plannerRouter = router({
  plans: planRouter,
  labels: labelRouter,
  buckets: bucketRouter,
})
