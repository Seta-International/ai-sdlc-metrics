import { Inject, Module, OnModuleInit } from '@nestjs/common'
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
import { IdentityModule } from '../../modules/identity/identity.module'
import { AdminModule } from '../../modules/admin/admin.module'
import { PreferencesModule } from '../../modules/preferences/preferences.module'
import { DocumentsModule } from '../../modules/documents/documents.module'
import { DocumentsRouterService } from '../../modules/documents/interface/trpc/documents-router.service'
import {
  SAVED_VIEW_REPOSITORY,
  type ISavedViewRepository,
} from '../../modules/preferences/domain/repositories/saved-view.repository'
import { createKernelRouter } from '../../modules/kernel/interface/trpc/kernel.router'
import { createPeopleRouter } from '../../modules/people/interface/trpc/people.router'
import { createIdentityAdminRouter } from '../../modules/identity/interface/trpc/identity.router'
import { createAdminRouter } from '../../modules/admin/interface/trpc/admin.router'
import {
  setKernelRouter,
  setPeopleRouter,
  setIdentityAdminRouter,
  setAdminRouter,
  setPreferencesRouter,
  createPreferencesRouter,
  setDocumentsRouter,
  createDocumentsRouter,
  initAppRouter,
} from './app-router'

@Module({
  imports: [
    KernelModule,
    PeopleModule,
    IdentityModule,
    AdminModule,
    PreferencesModule,
    DocumentsModule,
  ],
})
export class TrpcModule implements OnModuleInit {
  constructor(
    @Inject(JWT_SERVICE) private readonly jwtService: JwtService,
    private readonly kernelFacade: KernelQueryFacade,
    @Inject(AUDIT_EVENT_REPOSITORY) private readonly auditRepo: IAuditEventRepository,
    private readonly peopleFacade: PeopleQueryFacade,
    @Inject(SAVED_VIEW_REPOSITORY) private readonly savedViewRepo: ISavedViewRepository,
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
    setIdentityAdminRouter(createIdentityAdminRouter(permissionProtectedProcedure))
    setAdminRouter(createAdminRouter(permissionProtectedProcedure))
    setPreferencesRouter(createPreferencesRouter(this.savedViewRepo))
    setDocumentsRouter(createDocumentsRouter(permissionProtectedProcedure))

    initAppRouter()
  }
}
