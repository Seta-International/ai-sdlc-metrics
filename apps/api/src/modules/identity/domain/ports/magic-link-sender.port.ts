export const MAGIC_LINK_SENDER = Symbol('IMagicLinkSender')

export interface IMagicLinkSender {
  sendInvitation(params: {
    email: string
    displayName: string
    tenantSlug: string
    token: string
  }): Promise<void>
}
