import { Injectable, OnModuleInit } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'

let instance: PlannerRouterService | null = null

@Injectable()
export class PlannerRouterService implements OnModuleInit {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  onModuleInit() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    instance = this
  }

  static getInstance(): PlannerRouterService {
    if (!instance) throw new Error('PlannerRouterService not initialized')
    return instance
  }

  command<T>(command: T): Promise<unknown> {
    return this.commandBus.execute(command as never)
  }

  query<T>(query: T): Promise<unknown> {
    return this.queryBus.execute(query as never)
  }
}
