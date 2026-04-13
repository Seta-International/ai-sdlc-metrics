import { Injectable, OnModuleInit } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { KernelQueryFacade } from '../../../kernel/application/facades/kernel-query.facade'
import { KernelPermissionFacade } from '../../../kernel/application/facades/kernel-permission.facade'

let instance: AdminRouterService | null = null

@Injectable()
export class AdminRouterService implements OnModuleInit {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    readonly kernelQuery: KernelQueryFacade,
    readonly kernelPermission: KernelPermissionFacade,
  ) {}

  onModuleInit() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    instance = this
  }

  static getInstance(): AdminRouterService {
    if (!instance) throw new Error('AdminRouterService not initialized')
    return instance
  }

  command<T>(command: T): Promise<unknown> {
    return this.commandBus.execute(command as never)
  }

  query<T>(query: T): Promise<unknown> {
    return this.queryBus.execute(query as never)
  }
}
