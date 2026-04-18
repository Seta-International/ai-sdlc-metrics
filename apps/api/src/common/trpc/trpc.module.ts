import { Inject, Module, OnModuleInit } from '@nestjs/common'
import { JWT_SERVICE } from '../auth/auth.module'
import type { JwtService } from '../auth/jwt.service'
import { createAuthenticatedProcedure } from './trpc-init'
import { createProtectedProcedures } from './create-protected-procedures'
import { KernelModule } from '../../modules/kernel/kernel.module'
import { KernelQueryFacade } from '../../modules/kernel/application/facades/kernel-query.facade'
import { KernelAuditFacade } from '../../modules/kernel/application/facades/kernel-audit.facade'
import { PeopleModule } from '../../modules/people/people.module'
import { PeopleQueryFacade } from '../../modules/people/application/facades/people-query.facade'
import { IdentityModule } from '../../modules/identity/identity.module'
import { AdminModule } from '../../modules/admin/admin.module'
import { PreferencesModule } from '../../modules/preferences/preferences.module'
import { PreferencesQueryFacade } from '../../modules/preferences/application/facades/preferences-query.facade'
import { DocumentsModule } from '../../modules/documents/documents.module'
import { NotificationsModule } from '../../modules/notifications/notifications.module'
import { createKernelRouter } from '../../modules/kernel/interface/trpc/kernel.router'
import { createPeopleRouter } from '../../modules/people/interface/trpc/people.router'
import { createIdentityAdminRouter } from '../../modules/identity/interface/trpc/identity.router'
import { createAdminRouter } from '../../modules/admin/interface/trpc/admin.router'
import { setIdentityJwtService } from '../../modules/kernel/interface/trpc/identity.router'
import {
  setKernelRouter,
  setPeopleRouter,
  setIdentityAdminRouter,
  setAdminRouter,
  setPreferencesRouter,
  createPreferencesRouter,
  setDocumentsRouter,
  createDocumentsRouter,
  setNotificationsRouter,
  createNotificationsRouter,
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
    NotificationsModule,
  ],
})
export class TrpcModule implements OnModuleInit {
  constructor(
    @Inject(JWT_SERVICE) private readonly jwtService: JwtService,
    private readonly kernelFacade: KernelQueryFacade,
    private readonly auditFacade: KernelAuditFacade,
    private readonly peopleFacade: PeopleQueryFacade,
    private readonly preferencesFacade: PreferencesQueryFacade,
  ) {}

  onModuleInit() {
    setIdentityJwtService(this.jwtService)

    const authenticatedProcedure = createAuthenticatedProcedure(this.jwtService)
    const { permissionProtectedProcedure } = createProtectedProcedures(
      authenticatedProcedure,
      this.kernelFacade,
      this.auditFacade,
    )

    setKernelRouter(createKernelRouter(permissionProtectedProcedure, this.kernelFacade))
    setPeopleRouter(
      createPeopleRouter(
        permissionProtectedProcedure,
        this.peopleFacade,
        this.kernelFacade,
        this.auditFacade,
      ),
    )
    setIdentityAdminRouter(createIdentityAdminRouter(permissionProtectedProcedure))
    setAdminRouter(createAdminRouter(permissionProtectedProcedure))
    setPreferencesRouter(
      createPreferencesRouter(permissionProtectedProcedure, this.preferencesFacade),
    )
    setDocumentsRouter(createDocumentsRouter(permissionProtectedProcedure))
    setNotificationsRouter(createNotificationsRouter(permissionProtectedProcedure))

    initAppRouter()
  }
}
