import { Module } from '@nestjs/common'
import { ProjectsQueryFacade } from './application/facades/projects-query.facade'

@Module({
  providers: [ProjectsQueryFacade],
  exports: [ProjectsQueryFacade],
})
export class ProjectsModule {}
