import { Injectable, OnModuleInit } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'

let instance: NotificationsRouterService | null = null

@Injectable()
export class NotificationsRouterService implements OnModuleInit {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  onModuleInit() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    instance = this
  }

  static getInstance(): NotificationsRouterService {
    if (!instance) throw new Error('NotificationsRouterService not initialized')
    return instance
  }

  command<T>(cmd: T): Promise<unknown> {
    return this.commandBus.execute(cmd as never)
  }

  query<T>(q: T): Promise<unknown> {
    return this.queryBus.execute(q as never)
  }
}
