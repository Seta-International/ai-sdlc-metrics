import type { IMagicLinkSender } from '../domain/ports/magic-link-sender.port'

export class MagicLinkSenderStub implements IMagicLinkSender {
  async sendInvitation(params: {
    email: string
    displayName: string
    tenantSlug: string
    token: string
  }): Promise<void> {
    console.log(
      `[MagicLinkSenderStub] Sending invitation to ${params.email} (${params.displayName}) for tenant ${params.tenantSlug}`,
    )
  }
}
