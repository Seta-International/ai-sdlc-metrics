import { Injectable, OnModuleInit } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'

let instance: DocumentsRouterService | null = null

@Injectable()
export class DocumentsRouterService implements OnModuleInit {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  onModuleInit() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    instance = this
  }

  static getInstance(): DocumentsRouterService {
    if (!instance) throw new Error('DocumentsRouterService not initialized')
    return instance
  }

  command<T>(cmd: T): Promise<unknown> {
    return this.commandBus.execute(cmd as never)
  }

  query<T>(q: T): Promise<unknown> {
    return this.queryBus.execute(q as never)
  }
}
