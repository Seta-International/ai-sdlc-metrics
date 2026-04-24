import { Injectable } from '@nestjs/common'
import { CommandBus, EventsHandler, type IEventHandler } from '@nestjs/cqrs'
import {
  MS_SYNC_CREDENTIAL_INVALIDATED_EVENT,
  type MsSyncCredentialInvalidatedEvent,
} from '@future/event-contracts'
import { KernelQueryFacade } from '../../../kernel/application/facades/kernel-query.facade'
import { SendNotificationCommand } from '../../../notifications/application/commands/send-notification.command'

function isMsSyncCredentialInvalidatedEvent(
  event: unknown,
): event is MsSyncCredentialInvalidatedEvent {
  if (!event || typeof event !== 'object') {
    return false
  }

  const value = event as Partial<MsSyncCredentialInvalidatedEvent>
  return (
    value.type === MS_SYNC_CREDENTIAL_INVALIDATED_EVENT &&
    typeof value.tenantId === 'string' &&
    typeof value.reason === 'string'
  )
}

@EventsHandler(Object)
@Injectable()
export class MsSyncCredentialInvalidatedListener implements IEventHandler {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly kernelQueryFacade: KernelQueryFacade,
  ) {}

  async handle(event: unknown): Promise<void> {
    if (!isMsSyncCredentialInvalidatedEvent(event)) {
      return
    }

    const recipients = await this.resolveTenantAdminRecipients(event.tenantId)

    const notifiedActors = new Set<string>()
    for (const recipient of recipients) {
      if (!recipient.email?.trim() || notifiedActors.has(recipient.actorId)) {
        continue
      }
      notifiedActors.add(recipient.actorId)

      await this.commandBus.execute(
        new SendNotificationCommand(
          event.tenantId,
          recipient.actorId,
          null,
          'system',
          'Microsoft 365 Planner sync disconnected',
          `Microsoft 365 sync was disconnected for your tenant. Reason: ${event.reason}`,
          null,
          null,
          null,
        ),
      )
    }
  }

  private async resolveTenantAdminRecipients(
    tenantId: string,
  ): Promise<Array<{ actorId: string; email: string }>> {
    const queryFacade = this.kernelQueryFacade as KernelQueryFacade & {
      listActorsWithRole?: (
        tenantId: string,
        roleKey: string,
      ) => Promise<Array<Record<string, unknown>>>
    }

    if (typeof queryFacade.listActorsWithRole === 'function') {
      const actors = await queryFacade.listActorsWithRole(tenantId, 'tenant_admin')
      const recipients: Array<{ actorId: string; email: string }> = []
      for (const actor of actors) {
        const actorId = this.readString(actor, 'actorId') ?? this.readString(actor, 'id')
        const email = this.readString(actor, 'email')
        if (!actorId || !email) {
          continue
        }
        recipients.push({ actorId, email })
      }
      return recipients
    }

    const users = await this.kernelQueryFacade.getLocalUsersWithActors(tenantId)
    let localAdminCount = 0
    for (const user of users) {
      const isAdmin = await this.kernelQueryFacade.hasRole(user.actorId, 'tenant_admin', tenantId)
      if (isAdmin) {
        localAdminCount += 1
      }
    }

    throw new Error(
      `KernelQueryFacade.listActorsWithRole is required to notify all tenant_admin actors (found ${localAdminCount} local tenant_admin candidate(s); refusing local-only fallback).`,
    )
  }

  private readString(source: Record<string, unknown>, key: string): string | null {
    const value = source[key]
    return typeof value === 'string' ? value : null
  }
}
