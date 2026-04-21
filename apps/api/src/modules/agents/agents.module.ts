import { Module, type OnModuleInit } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { AgentsQueryFacade } from './application/facades/agents-query.facade'
import { AgentPermissionService } from './application/services/agent-permission.service'
import { AgentToolExecutor } from './application/services/agent-tool-executor'
import { McpAuthGuard } from './infrastructure/guards/mcp-auth.guard'
import { ExposureContractGuard } from './infrastructure/guards/exposure-contract.guard'
import { ToolPermissionGuard } from './infrastructure/guards/tool-permission.guard'
import { KernelModule } from '../kernel/kernel.module'
// Repository tokens
import { AGENT_SESSION_REPOSITORY } from './domain/repositories/agent-session.repository'
import { AGENT_MESSAGE_REPOSITORY } from './domain/repositories/agent-message.repository'
import { AGENT_INSIGHT_REPOSITORY } from './domain/repositories/agent-insight.repository'
import { PROMPT_STORE } from './domain/ports/prompt-store.port'
import { NARRATIVE_STORE } from './domain/ports/narrative-store.port'
// Drizzle repositories
import { DrizzleAgentSessionRepository } from './infrastructure/repositories/drizzle-agent-session.repository'
import { DrizzleAgentMessageRepository } from './infrastructure/repositories/drizzle-agent-message.repository'
import { DrizzleAgentInsightRepository } from './infrastructure/repositories/drizzle-agent-insight.repository'
import { DrizzlePromptStoreRepository } from './infrastructure/repositories/drizzle-prompt-store.repository'
import { DrizzleNarrativeStoreRepository } from './infrastructure/repositories/drizzle-narrative-store.repository'
// Command handlers
import { CreateSessionHandler } from './application/commands/create-session.handler'
import { SendMessageHandler } from './application/commands/send-message.handler'
import { DismissInsightHandler } from './application/commands/dismiss-insight.handler'
// Query handlers
import { ListSessionsHandler } from './application/queries/list-sessions.handler'
import { ListInsightsHandler } from './application/queries/list-insights.handler'
// tRPC handler setters
import { setAgentSessionHandlers } from './interface/trpc/session.router'
import { setAgentInsightHandlers } from './interface/trpc/insight.router'
// Gateway pipeline (Task 5)
import { ToolRegistry } from './infrastructure/tool-registry/tool-registry'
import { TrpcCallerImpl } from './application/services/trpc-caller'
import { ToolGateway } from './application/services/tool-gateway'
import { KernelAuditFacade } from '../kernel/application/facades/kernel-audit.facade'
import { getAppRouter } from '../../common/trpc/app-router'

@Module({
  imports: [
    KernelModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '8h' },
      }),
    }),
  ],
  providers: [
    // Repositories
    { provide: AGENT_SESSION_REPOSITORY, useClass: DrizzleAgentSessionRepository },
    { provide: AGENT_MESSAGE_REPOSITORY, useClass: DrizzleAgentMessageRepository },
    { provide: AGENT_INSIGHT_REPOSITORY, useClass: DrizzleAgentInsightRepository },
    { provide: PROMPT_STORE, useClass: DrizzlePromptStoreRepository },
    { provide: NARRATIVE_STORE, useClass: DrizzleNarrativeStoreRepository },
    // Command handlers
    CreateSessionHandler,
    SendMessageHandler,
    DismissInsightHandler,
    // Query handlers
    ListSessionsHandler,
    ListInsightsHandler,
    // Existing providers
    AgentsQueryFacade,
    AgentPermissionService,
    AgentToolExecutor,
    McpAuthGuard,
    ExposureContractGuard,
    ToolPermissionGuard,
    // Gateway pipeline (Task 5)
    ToolRegistry,
    TrpcCallerImpl,
    ToolGateway,
  ],
  exports: [AgentsQueryFacade],
})
export class AgentsModule implements OnModuleInit {
  constructor(
    private readonly createSession: CreateSessionHandler,
    private readonly sendMessage: SendMessageHandler,
    private readonly dismissInsight: DismissInsightHandler,
    private readonly listSessions: ListSessionsHandler,
    private readonly listInsights: ListInsightsHandler,
    private readonly toolRegistry: ToolRegistry,
  ) {}

  onModuleInit() {
    setAgentSessionHandlers({
      createSession: this.createSession,
      listSessions: this.listSessions,
      sendMessage: this.sendMessage,
    })
    setAgentInsightHandlers({
      listInsights: this.listInsights,
      dismissInsight: this.dismissInsight,
    })

    // Load agent tools from the assembled tRPC router.
    // TrpcModule.onModuleInit() must have run before AgentsModule.onModuleInit()
    // to ensure permission-enforcing routers have been swapped in.
    // NestJS module init order is determined by import order in AppModule;
    // TrpcModule is imported before AgentsModule in app.module.ts.
    this.toolRegistry.loadFromRouter(getAppRouter())
  }
}
