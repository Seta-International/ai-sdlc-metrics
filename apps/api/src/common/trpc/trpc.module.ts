import { Inject, Module, type OnModuleInit } from '@nestjs/common'
import { JWT_SERVICE } from '../auth/auth.module'
import type { JwtService } from '../auth/jwt.service'
import { initProtectedProcedure } from './trpc-init'
import { createProtectedProcedures } from './create-protected-procedures'
import { KernelModule } from '../../modules/kernel/kernel.module'
import { KernelQueryFacade } from '../../modules/kernel/application/facades/kernel-query.facade'
import {
  AUDIT_EVENT_REPOSITORY,
  type IAuditEventRepository,
} from '../../modules/kernel/domain/repositories/audit-event.repository.port'
import { PeopleModule } from '../../modules/people/people.module'
import { PeopleQueryFacade } from '../../modules/people/application/facades/people-query.facade'
import { createKernelRouter } from '../../modules/kernel/interface/trpc/kernel.router'
import { createPeopleRouter } from '../../modules/people/interface/trpc/people.router'
import { setKernelRouter, setPeopleRouter, initAppRouter } from './app-router'

@Module({
  imports: [KernelModule, PeopleModule],
})
export class TrpcModule implements OnModuleInit {
  constructor(
    @Inject(JWT_SERVICE) private readonly jwtService: JwtService,
    private readonly kernelFacade: KernelQueryFacade,
    @Inject(AUDIT_EVENT_REPOSITORY) private readonly auditRepo: IAuditEventRepository,
    private readonly peopleFacade: PeopleQueryFacade,
  ) {}

  onModuleInit() {
    initProtectedProcedure(this.jwtService)

    const { permissionProtectedProcedure } = createProtectedProcedures(
      this.kernelFacade,
      this.auditRepo,
    )

    setKernelRouter(createKernelRouter(permissionProtectedProcedure, this.kernelFacade))
    setPeopleRouter(
      createPeopleRouter(
        permissionProtectedProcedure,
        this.peopleFacade,
        this.kernelFacade,
        this.auditRepo,
      ),
    )

    initAppRouter()
  }
}
