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
import { AGENT_CHAT_SESSION_REPOSITORY } from './domain/repositories/agent-chat-session.repository'
import { AGENT_SESSION_PORT } from './domain/ports/agent-session.port'
import { STORED_SUB_AGENT_PORT } from './domain/ports/stored-sub-agent.port'
import { AGENT_MESSAGE_REPOSITORY } from './domain/repositories/agent-message.repository'
import { AGENT_INSIGHT_REPOSITORY } from './domain/repositories/agent-insight.repository'
import { PROMPT_STORE } from './domain/ports/prompt-store.port'
import { NARRATIVE_STORE } from './domain/ports/narrative-store.port'
// Drizzle repositories
import { DrizzleAgentChatSessionRepository } from './infrastructure/repositories/drizzle-agent-chat-session.repository'
import { DrizzleAgentSessionRepository } from './infrastructure/repositories/drizzle-agent-session.repository'
import { DrizzleStoredSubAgentRepository } from './infrastructure/repositories/drizzle-stored-sub-agent.repository'
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
import { getAppRouter } from '../../common/trpc/app-router'
// Sub-agent registry (Task 3)
import { SubAgentRegistry, SUB_AGENT_REGISTRY } from './infrastructure/registry/sub-agent-registry'
// Intent registry (Task 4)
import { IntentRegistry, INTENT_REGISTRY } from './infrastructure/registry/intents/intent-registry'
// Module sub-agent barrels.
//   • Adding a sub-agent to an EXISTING module: re-export it from that module's
//     barrel (agent/sub-agents/index.ts). No changes here are needed.
//   • Adding sub-agents for a NEW domain module: add a new import below and
//     include the descriptor(s) in the `descriptors` array in onModuleInit().
import { plannerReadOnlySubAgent } from '../planner/agent/sub-agents'
// Module intent barrels.
//   • Adding an intent to an EXISTING module: re-export it from that module's
//     barrel (agent/intents/index.ts). No changes here are needed.
//   • Adding intents for a NEW domain module: add a new import below and
//     include the descriptor(s) in the `intentDescriptors` array in onModuleInit().
import { unclassifiedIntent } from './intents'
import { listMyTasksIntent, listMyPlansIntent, listEvidenceIntent } from '../planner/agent/intents'
import { viewMyProfileIntent } from '../people/agent/intents'
import { listMyAssignmentsIntent } from '../projects/agent/intents'

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
    { provide: AGENT_CHAT_SESSION_REPOSITORY, useClass: DrizzleAgentChatSessionRepository },
    { provide: AGENT_SESSION_PORT, useClass: DrizzleAgentSessionRepository },
    { provide: STORED_SUB_AGENT_PORT, useClass: DrizzleStoredSubAgentRepository },
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
    // Sub-agent registry (Task 3)
    SubAgentRegistry,
    { provide: SUB_AGENT_REGISTRY, useExisting: SubAgentRegistry },
    // Intent registry (Task 4)
    IntentRegistry,
    { provide: INTENT_REGISTRY, useExisting: IntentRegistry },
  ],
  exports: [AgentsQueryFacade, SUB_AGENT_REGISTRY, INTENT_REGISTRY],
})
export class AgentsModule implements OnModuleInit {
  constructor(
    private readonly createSession: CreateSessionHandler,
    private readonly sendMessage: SendMessageHandler,
    private readonly dismissInsight: DismissInsightHandler,
    private readonly listSessions: ListSessionsHandler,
    private readonly listInsights: ListInsightsHandler,
    private readonly toolRegistry: ToolRegistry,
    private readonly subAgentRegistry: SubAgentRegistry,
    private readonly intentRegistry: IntentRegistry,
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

    // Step 1: Load agent tools from the assembled tRPC router.
    // TrpcModule.onModuleInit() must have run before AgentsModule.onModuleInit()
    // to ensure permission-enforcing routers have been swapped in.
    // NestJS module init order is determined by import order in AppModule;
    // TrpcModule is imported before AgentsModule in app.module.ts.
    this.toolRegistry.loadFromRouter(getAppRouter())

    // Step 2: Boot the sub-agent registry AFTER the tool registry has loaded.
    // Order is critical: SubAgentRegistry.boot validates toolScope entries against
    // the ToolRegistry — the tool registry must be populated first.
    //
    // To add a sub-agent for a new domain module:
    //   1. Create apps/api/src/modules/<domain>/agent/sub-agents/<name>.ts
    //   2. Re-export it from apps/api/src/modules/<domain>/agent/sub-agents/index.ts
    //   3. Import the export here and include it in the descriptors array below.
    const descriptors = [
      // Planner module sub-agents
      plannerReadOnlySubAgent,
    ]
    this.subAgentRegistry.boot(descriptors, this.toolRegistry)

    // Step 3: Boot the intent registry.
    // Order: after subAgentRegistry.boot for readability. The intent registry
    // has no dependency on the tool registry — it validates slugs and domain
    // consistency only.
    //
    // To add an intent for a new domain module:
    //   1. Create apps/api/src/modules/<domain>/agent/intents/<name>.ts
    //   2. Re-export it from apps/api/src/modules/<domain>/agent/intents/index.ts
    //   3. Import the export here and include it in intentDescriptors below.
    const intentDescriptors = [
      // agents module (fallback)
      unclassifiedIntent,
      // Planner module intents
      listMyTasksIntent,
      listMyPlansIntent,
      listEvidenceIntent,
      // People module intents
      viewMyProfileIntent,
      // Projects module intents
      listMyAssignmentsIntent,
    ]
    this.intentRegistry.boot(intentDescriptors)
  }
}
