import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import { ProjectNotFoundException } from '../../domain/exceptions/projects.exceptions'
import {
  PROJECT_REPOSITORY,
  type IProjectRepository,
} from '../../domain/repositories/project.repository.port'
import {
  PROJECT_ROLE_REPOSITORY,
  type IProjectRoleRepository,
} from '../../domain/repositories/project-role.repository.port'
import type { Project } from '../../domain/entities/project.entity'
import type { ProjectRole } from '../../domain/entities/project-role.entity'
import { GetProjectQuery } from './get-project.query'

export interface GetProjectResult {
  project: Project
  roles: ProjectRole[]
}

@QueryHandler(GetProjectQuery)
export class GetProjectHandler implements IQueryHandler<GetProjectQuery, GetProjectResult> {
  constructor(
    @Inject(PROJECT_REPOSITORY) private readonly projectRepo: IProjectRepository,
    @Inject(PROJECT_ROLE_REPOSITORY) private readonly roleRepo: IProjectRoleRepository,
  ) {}

  async execute(query: GetProjectQuery): Promise<GetProjectResult> {
    const project = await this.projectRepo.findById(query.projectId, query.tenantId)
    if (!project) {
      throw new ProjectNotFoundException(query.projectId)
    }

    const roles = await this.roleRepo.findByProjectId(query.projectId, query.tenantId)

    return { project, roles }
  }
}
