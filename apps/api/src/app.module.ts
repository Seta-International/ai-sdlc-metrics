import { MiddlewareConsumer, Module, type NestModule } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { AppClsModule } from './common/cls/cls.module'
import { DbModule } from './common/db/db.module'
import { TrpcModule } from './common/trpc/trpc.module'
import { AuthModule } from './common/auth/auth.module'
import { HealthController } from './common/health/health.controller'
import { RlsMiddleware } from './common/rls/rls.middleware'
import { KernelModule } from './modules/kernel/kernel.module'
import { IdentityModule } from './modules/identity/identity.module'
import { PeopleModule } from './modules/people/people.module'
import { TimeModule } from './modules/time/time.module'
import { HiringModule } from './modules/hiring/hiring.module'
import { PerformanceModule } from './modules/performance/performance.module'
import { ProjectsModule } from './modules/projects/projects.module'
import { FinanceModule } from './modules/finance/finance.module'
import { GoalsModule } from './modules/goals/goals.module'
import { InsightsModule } from './modules/insights/insights.module'
import { AgentsModule } from './modules/agents/agents.module'
import { PlannerModule } from './modules/planner/planner.module'
import { AdminModule } from './modules/admin/admin.module'
import { NotificationsModule } from './modules/notifications/notifications.module'
import { DocumentsModule } from './modules/documents/documents.module'
import { PreferencesModule } from './modules/preferences/preferences.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DbModule,
    AppClsModule,
    AuthModule,
    TrpcModule,
    KernelModule,
    IdentityModule,
    PeopleModule,
    TimeModule,
    HiringModule,
    PerformanceModule,
    ProjectsModule,
    FinanceModule,
    GoalsModule,
    InsightsModule,
    AgentsModule,
    PlannerModule,
    AdminModule,
    NotificationsModule,
    DocumentsModule,
    PreferencesModule,
  ],
  controllers: [HealthController],
  providers: [RlsMiddleware],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RlsMiddleware).forRoutes('*')
  }
}
