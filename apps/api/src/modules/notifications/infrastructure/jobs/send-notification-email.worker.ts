import { Inject, Injectable, Logger } from '@nestjs/common'
import type PgBoss from 'pg-boss'
import { createMailTransport, renderMjmlTemplate } from '@future/mail'
import type { INotificationRepository } from '../../domain/repositories/notification.repository.port'
import { NOTIFICATION_REPOSITORY } from '../../domain/repositories/notification.repository.port'
import { PeopleQueryFacade } from '../../../people/application/facades/people-query.facade'
import { AdminQueryFacade } from '../../../admin/application/facades/admin-query.facade'

export interface SendEmailJobData {
  notificationId: string
  tenantId: string
  recipientId: string
}

const PLATFORM_SES_FROM =
  process.env['PLATFORM_SES_FROM_ADDRESS'] ?? 'noreply@seta-international.vn'
const PLATFORM_SES_REGION = process.env['PLATFORM_SES_REGION'] ?? 'ap-southeast-1'

@Injectable()
export class SendNotificationEmailWorker {
  private readonly logger = new Logger(SendNotificationEmailWorker.name)

  constructor(
    @Inject(NOTIFICATION_REPOSITORY) private readonly notifRepo: INotificationRepository,
    private readonly peopleFacade: PeopleQueryFacade,
    private readonly adminFacade: AdminQueryFacade,
  ) {}

  async handle(job: PgBoss.Job<SendEmailJobData>): Promise<void> {
    const { notificationId, tenantId, recipientId } = job.data

    const notification = await this.notifRepo.findById(tenantId, notificationId)

    if (!notification) {
      this.logger.warn(`Notification not found for email: ${notificationId}`)
      return
    }

    const profileResult = await this.peopleFacade.getProfile(recipientId, tenantId)
    if (!profileResult?.profile.companyEmail) {
      this.logger.warn(`No email for actor ${recipientId} — skipping email notification`)
      return
    }

    const emailConfig = await this.adminFacade.getEmailConfig(tenantId)

    const mailConfig =
      emailConfig === null
        ? { provider: 'ses' as const, fromAddress: PLATFORM_SES_FROM, region: PLATFORM_SES_REGION }
        : emailConfig.provider === 'ses'
          ? {
              provider: 'ses' as const,
              fromAddress: emailConfig.fromAddress,
              region: PLATFORM_SES_REGION,
            }
          : {
              provider: 'smtp' as const,
              fromAddress: emailConfig.fromAddress,
              smtpHost: emailConfig.smtpHost!,
              smtpPort: emailConfig.smtpPort!,
              smtpUser: emailConfig.credentialRef,
              smtpPass: '',
            }

    const transport = createMailTransport(mailConfig)
    const html = renderMjmlTemplate('notification', {
      title: notification.title,
      body: notification.body ?? '',
      resourceUrl: notification.resourceUrl ?? '',
    })

    try {
      await transport.send({
        to: profileResult.profile.companyEmail,
        subject: notification.title,
        html,
      })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      this.logger.error(`Failed to send email notification ${notificationId}: ${message}`)
      throw err // let pg-boss retry
    }
  }
}
