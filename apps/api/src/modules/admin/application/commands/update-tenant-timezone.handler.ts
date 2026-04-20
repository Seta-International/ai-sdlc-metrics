import { BadRequestException, Inject, Injectable } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import type { Db } from '@future/db'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { tenantSettings } from '../../infrastructure/schema/admin.schema'
import { UpdateTenantTimezoneCommand } from './update-tenant-timezone.command'

function isValidIanaZone(tz: string): boolean {
  if (!tz) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date())
    return true
  } catch {
    return false
  }
}

@Injectable()
@CommandHandler(UpdateTenantTimezoneCommand)
export class UpdateTenantTimezoneHandler implements ICommandHandler<
  UpdateTenantTimezoneCommand,
  void
> {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async execute(command: UpdateTenantTimezoneCommand): Promise<void> {
    if (!isValidIanaZone(command.timezone)) {
      throw new BadRequestException(`Unknown IANA timezone: ${command.timezone}`)
    }
    await this.db
      .insert(tenantSettings)
      .values({ tenantId: command.tenantId, timezone: command.timezone })
      .onConflictDoUpdate({
        target: tenantSettings.tenantId,
        set: { timezone: command.timezone, updatedAt: new Date() },
      })
  }
}
