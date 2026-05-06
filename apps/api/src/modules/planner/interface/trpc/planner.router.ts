import { router } from '../../../../common/trpc/trpc-init'
import { planRouter } from './plan.router'
import { labelRouter } from './label.router'
import { bucketRouter } from './bucket.router'
import { taskRouter } from './task.router'
import { checklistRouter } from './checklist.router'
import { attachmentRouter } from './attachment.router'
import { commentRouter } from './comment.router'
import { evidenceRouter } from './evidence.router'
import { personalRouter } from './personal.router'
import { msSyncRouter } from './ms-sync.router'
import { customFieldRouter } from './custom-field.router'

export const plannerRouter = router({
  plans: planRouter,
  labels: labelRouter,
  buckets: bucketRouter,
  tasks: taskRouter,
  checklist: checklistRouter,
  attachments: attachmentRouter,
  comments: commentRouter,
  evidence: evidenceRouter,
  personal: personalRouter,
  msSync: msSyncRouter,
  customFields: customFieldRouter,
})
