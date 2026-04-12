import { Inject, Injectable, Logger } from '@nestjs/common'
import { createMailTransport } from '@future/mail'
import type { IMagicLinkSender } from '../../domain/ports/magic-link-sender.port'
import { AdminQueryFacade } from '../../../admin/application/facades/admin-query.facade'

@Injectable()
export class MailMagicLinkSender implements IMagicLinkSender {
  private readonly logger = new Logger(MailMagicLinkSender.name)

  constructor(
    @Inject(AdminQueryFacade)
    private readonly adminQueryFacade: AdminQueryFacade,
  ) {}

  async sendInvitation(params: {
    email: string
    displayName: string
    tenantSlug: string
    token: string
  }): Promise<void> {
    const emailConfig = await this.adminQueryFacade.getEmailConfig(params.tenantSlug)
    if (!emailConfig) {
      this.logger.warn(
        `No email config found for tenant ${params.tenantSlug} — skipping magic link invitation for ${params.email}`,
      )
      return
    }

    const transport = createMailTransport(
      emailConfig.provider === 'ses'
        ? {
            provider: 'ses',
            fromAddress: emailConfig.fromAddress,
            region: process.env.AWS_REGION ?? 'ap-southeast-1',
          }
        : {
            provider: 'smtp',
            fromAddress: emailConfig.fromAddress,
            smtpHost: emailConfig.smtpHost!,
            smtpPort: emailConfig.smtpPort!,
            smtpUser: emailConfig.credentialRef,
            smtpPass: '',
          },
    )

    const magicLinkUrl = `https://app.future.seta.io/auth/magic?token=${params.token}`

    await transport.send({
      to: params.email,
      subject: 'You have been invited to Future',
      html: `
        <p>Hi ${params.displayName},</p>
        <p>You have been invited to join the Future platform.</p>
        <p>Click the link below to sign in (valid for 15 minutes):</p>
        <p><a href="${magicLinkUrl}">Sign in to Future</a></p>
        <p>If you did not expect this invitation, you can safely ignore this email.</p>
      `,
    })
  }
}
