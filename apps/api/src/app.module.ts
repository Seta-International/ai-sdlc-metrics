import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { AppClsModule } from './common/cls/cls.module.js'
import { TrpcModule } from './common/trpc/trpc.module.js'
import { HealthController } from './common/health/health.controller.js'
import { KernelModule } from './modules/kernel/kernel.module.js'
import { PeopleModule } from './modules/people/people.module.js'
import { TimeModule } from './modules/time/time.module.js'
import { HiringModule } from './modules/hiring/hiring.module.js'
import { PerformanceModule } from './modules/performance/performance.module.js'
import { ProjectsModule } from './modules/projects/projects.module.js'
import { FinanceModule } from './modules/finance/finance.module.js'
import { GoalsModule } from './modules/goals/goals.module.js'
import { InsightsModule } from './modules/insights/insights.module.js'
import { AgentsModule } from './modules/agents/agents.module.js'
import { PlannerModule } from './modules/planner/planner.module.js'
import { AdminModule } from './modules/admin/admin.module.js'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AppClsModule,
    TrpcModule,
    KernelModule,
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
  ],
  controllers: [HealthController],
})
export class AppModule {}
