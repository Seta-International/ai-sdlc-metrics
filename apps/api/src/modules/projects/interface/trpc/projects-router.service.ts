import { Injectable } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'

/**
 * Singleton NestJS service that exposes CommandBus/QueryBus to the tRPC router.
 * The tRPC router is a static object (not NestJS-managed), so it cannot use
 * constructor injection. Instead, the router calls ProjectsRouterService methods.
 */
@Injectable()
export class ProjectsRouterService {
  private static instance: ProjectsRouterService

  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {
    ProjectsRouterService.instance = this
  }

  static getInstance(): ProjectsRouterService {
    if (!ProjectsRouterService.instance) {
      throw new Error('ProjectsRouterService not initialized — ensure ProjectsModule is imported')
    }
    return ProjectsRouterService.instance
  }

  getCommandBus(): CommandBus {
    return this.commandBus
  }

  getQueryBus(): QueryBus {
    return this.queryBus
  }
}
