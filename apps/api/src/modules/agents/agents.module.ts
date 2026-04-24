import { Inject, Module, type OnModuleInit, type OnApplicationBootstrap } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { ConfigModule, ConfigService } from '@nestjs/config'
// Plan 06 — Streaming + SSE + Cancellation
import { ActiveTurnRegistry } from './application/services/active-turn-registry'
import { RequestContextDiscipline } from './application/services/request-context-discipline'
import { CrossPodCancelService } from './infrastructure/cross-pod-cancel'
import { AgentTurnController } from './interface/http/agent-turn-controller'
import { AgentCancelController } from './interface/http/agent-cancel-controller'
import { JwtService } from '../../common/auth/jwt.service'
import { JWT_SERVICE } from '../../common/auth/auth.module'
import { AgentsQueryFacade } from './application/facades/agents-query.facade'
import { AgentPermissionService } from './application/services/agent-permission.service'
import { AgentToolExecutor } from './application/services/agent-tool-executor'
import { McpAuthGuard } from './infrastructure/guards/mcp-auth.guard'
import { ExposureContractGuard } from './infrastructure/guards/exposure-contract.guard'
import { ToolPermissionGuard } from './infrastructure/guards/tool-permission.guard'
import { KernelModule } from '../kernel/kernel.module'
import { KernelAuditFacade } from '../kernel/application/facades/kernel-audit.facade'
// Repository tokens — pre-Plan 04
import { AGENT_CHAT_SESSION_REPOSITORY } from './domain/repositories/agent-chat-session.repository'
import { AGENT_SESSION_PORT } from './domain/ports/agent-session.port'
import { STORED_SUB_AGENT_PORT } from './domain/ports/stored-sub-agent.port'
import { AGENT_MESSAGE_REPOSITORY } from './domain/repositories/agent-message.repository'
import { AGENT_INSIGHT_REPOSITORY } from './domain/repositories/agent-insight.repository'
import { PROMPT_STORE } from './domain/ports/prompt-store.port'
import { NARRATIVE_STORE } from './domain/ports/narrative-store.port'
// Repository tokens — Plan 04
import { CONVERSATION_REPOSITORY } from './domain/repositories/conversation.repository'
import { CONVERSATION_MESSAGE_REPOSITORY } from './domain/repositories/conversation-message.repository'
import { L3_PREFERENCE_REPOSITORY } from './domain/repositories/l3-preference.repository'
import { SCRATCHPAD_REPOSITORY } from './domain/repositories/scratchpad.repository'
import { SEMANTIC_INDEX_REPOSITORY } from './domain/repositories/semantic-index.repository'
// Drizzle repositories — pre-Plan 04
import { DrizzleAgentChatSessionRepository } from './infrastructure/repositories/drizzle-agent-chat-session.repository'
import { DrizzleAgentSessionRepository } from './infrastructure/repositories/drizzle-agent-session.repository'
import { DrizzleStoredSubAgentRepository } from './infrastructure/repositories/drizzle-stored-sub-agent.repository'
import { DrizzleAgentMessageRepository } from './infrastructure/repositories/drizzle-agent-message.repository'
import { DrizzleAgentInsightRepository } from './infrastructure/repositories/drizzle-agent-insight.repository'
import { DrizzlePromptStoreRepository } from './infrastructure/repositories/drizzle-prompt-store.repository'
import { DrizzleNarrativeStoreRepository } from './infrastructure/repositories/drizzle-narrative-store.repository'
// Drizzle repositories — Plan 04
import { DrizzleConversationRepository } from './infrastructure/repositories/drizzle-conversation.repository'
import { DrizzleConversationMessageRepository } from './infrastructure/repositories/drizzle-conversation-message.repository'
import { DrizzleL3PreferenceRepository } from './infrastructure/repositories/drizzle-l3-preference.repository'
import { DrizzleScratchpadRepository } from './infrastructure/repositories/drizzle-scratchpad.repository'
import { NullSemanticIndexRepository } from './infrastructure/repositories/null-semantic-index.repository'
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
import { setPreferencesService } from './interface/trpc/preferences.router'
import { setConversationRepository } from './interface/trpc/conversation.router'
import { setDraftRepository } from './interface/trpc/draft-audit.router'
// Permission narrative builder (Task 6)
import {
  PermissionNarrativeBuilder,
  PERMISSION_NARRATIVE_BUILDER,
} from './application/services/permission-narrative-builder'
// Router prompt builder (Task 7)
import {
  RouterPromptBuilder,
  ROUTER_PROMPT_BUILDER,
} from './application/services/router-prompt-builder'
// Sub-agent retriever (Task 8)
import { SubAgentRetriever, SUB_AGENT_RETRIEVER } from './application/services/sub-agent-retriever'
// Router decision parser (Task 9)
import {
  RouterDecisionParser,
  ROUTER_DECISION_PARSER,
} from './application/services/router-decision-parser'
// Router LLM client (Task 9)
import { RouterLlmClient, ROUTER_LLM_CLIENT } from './infrastructure/llm/router-llm-client'
// Router session orchestrator (Task 10)
import {
  RouterSessionOrchestrator,
  ROUTER_SESSION_ORCHESTRATOR,
} from './application/services/router-session-orchestrator'
// Gateway pipeline (Task 5)
import { ToolRegistry } from './infrastructure/tool-registry/tool-registry'
import { TrpcCallerImpl } from './application/services/trpc-caller'
import { ToolGateway } from './application/services/tool-gateway'
import { getAppRouter } from '../../common/trpc/app-router'
// Sub-agent registry (Task 3)
import { SubAgentRegistry, SUB_AGENT_REGISTRY } from './infrastructure/registry/sub-agent-registry'
// Intent registry (Task 4)
import { IntentRegistry, INTENT_REGISTRY } from './infrastructure/registry/intents/intent-registry'
// Tool descriptor embedder (Plan 02.5 Task 1)
import {
  ToolDescriptorEmbedder,
  TOOL_DESCRIPTOR_EMBEDDER,
} from './infrastructure/retrieval/tool-descriptor-embedder'
// Tool retriever (Plan 02.5 Task 2)
import { ToolRetriever, TOOL_RETRIEVER } from './infrastructure/retrieval/tool-retriever'
// When-to-use collision linter (Plan 02.5 Task 3)
import {
  WhenToUseCollisionLinter,
  WHEN_TO_USE_COLLISION_LINTER,
} from './application/services/when-to-use-collision-linter'
// Retrieval quality scorer (Plan 02.5 Task 4)
import {
  RetrievalQualityScorer,
  RETRIEVAL_QUALITY_SCORER,
} from './application/services/retrieval-quality-scorer'
// Plan 04 services
import { SaveQueue } from './application/services/save-queue'
import { L3PreferenceService } from './application/services/l3-preferences'
import { WindowBuilder } from './application/services/window-builder'
import { Summarizer } from './application/services/summarizer'
import { GDPRErasurePipeline } from './application/services/gdpr-erasure'
import {
  ConversationRetentionScheduler,
  type TenantListerLike,
} from './application/services/conversation-retention-scheduler'
import {
  CompositionMonitorWorker,
  type CompositionMonitorJobData,
} from './infrastructure/jobs/composition-monitor.worker'
import { LeakCanaryScheduler } from './infrastructure/jobs/leak-canary.scheduler'
import { TurnSamplingDecisionRecorder } from './application/services/turn-sampling-decision-recorder'
import { ToolInvocationAuditRecorder } from './application/services/tool-invocation-audit-recorder'
// Plan 05 services
import { PricingResolver } from './infrastructure/pricing/pricing-resolver'
import { OpenAiUsageExtractor } from './infrastructure/adapters/openai-usage-extractor'
import { CostRecorder } from './application/services/cost-recorder'
import { BudgetChecker } from './application/services/budget-checker'
import { RateLimiter } from './application/services/rate-limiter'
import { QualityCanarySubscription } from './application/services/quality-canary-subscription'
import { ApprovalInboxThrottle } from './application/services/approval-inbox-throttle'
import { AdminBudgetOps } from './application/commands/admin-budget-ops'
import { ApprovalExecutorDelegationMinter } from './application/services/approval-executor-delegation-minter'
import { DraftTierClassifier } from './application/services/draft-tier-classifier'
import { FlowPolicyResolver } from './application/services/flow-policy-resolver'
import { DraftSink } from './application/services/draft-sink'
import { DraftProposer } from './application/services/draft-proposer'
import { DRAFT_REPOSITORY } from './domain/repositories/draft.repository'
import { DrizzleDraftRepository } from './infrastructure/repositories/drizzle-draft.repository'
import { NotificationsModule } from '../notifications/notifications.module'
import { NotificationsWriteFacade } from '../notifications/application/facades/notifications-write.facade'
import { ExecuteApprovedDraftWorker } from './infrastructure/workers/execute-approved-draft'
import {
  DraftExpirySweeper,
  DRAFT_EXPIRY_SWEEPER_JOB_NAME,
} from './infrastructure/workers/sweep-expired-drafts'
import type { ConversationRepository } from './domain/repositories/conversation.repository'
import type { ConversationMessageRepository } from './domain/repositories/conversation-message.repository'
import type { L3PreferenceRepository } from './domain/repositories/l3-preference.repository'
import type { ScratchpadRepository } from './domain/repositories/scratchpad.repository'
import type { SemanticIndexRepository } from './domain/repositories/semantic-index.repository'
import type { IDraftRepository } from './domain/repositories/draft.repository'
import { PgBossService } from '../../common/jobs/pg-boss.service'
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

// DI tokens for Plan 04 plain-class services
export const WINDOW_BUILDER = Symbol('WINDOW_BUILDER')
export const SUMMARIZER = Symbol('SUMMARIZER')
export const GDPR_ERASURE_PIPELINE = Symbol('GDPR_ERASURE_PIPELINE')
export const CONVERSATION_RETENTION_SCHEDULER = Symbol('CONVERSATION_RETENTION_SCHEDULER')

class NullTenantLister implements TenantListerLike {
  async listActiveTenantIds(): Promise<string[]> {
    return []
  }
}

@Module({
  imports: [
    KernelModule,
    NotificationsModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '8h' },
      }),
    }),
  ],
  controllers: [AgentTurnController, AgentCancelController],
  providers: [
    // ── Pre-Plan 04 repositories ───────────────────────────────────────────────
    { provide: AGENT_CHAT_SESSION_REPOSITORY, useClass: DrizzleAgentChatSessionRepository },
    { provide: AGENT_SESSION_PORT, useClass: DrizzleAgentSessionRepository },
    { provide: STORED_SUB_AGENT_PORT, useClass: DrizzleStoredSubAgentRepository },
    { provide: AGENT_MESSAGE_REPOSITORY, useClass: DrizzleAgentMessageRepository },
    { provide: AGENT_INSIGHT_REPOSITORY, useClass: DrizzleAgentInsightRepository },
    { provide: PROMPT_STORE, useClass: DrizzlePromptStoreRepository },
    { provide: NARRATIVE_STORE, useClass: DrizzleNarrativeStoreRepository },
    // ── Plan 04 repositories ───────────────────────────────────────────────────
    { provide: CONVERSATION_REPOSITORY, useClass: DrizzleConversationRepository },
    { provide: CONVERSATION_MESSAGE_REPOSITORY, useClass: DrizzleConversationMessageRepository },
    { provide: L3_PREFERENCE_REPOSITORY, useClass: DrizzleL3PreferenceRepository },
    { provide: SCRATCHPAD_REPOSITORY, useClass: DrizzleScratchpadRepository },
    { provide: SEMANTIC_INDEX_REPOSITORY, useClass: NullSemanticIndexRepository },
    // ── Command handlers ───────────────────────────────────────────────────────
    CreateSessionHandler,
    SendMessageHandler,
    DismissInsightHandler,
    // ── Query handlers ─────────────────────────────────────────────────────────
    ListSessionsHandler,
    ListInsightsHandler,
    // ── Core services ─────────────────────────────────────────────────────────
    AgentsQueryFacade,
    AgentPermissionService,
    AgentToolExecutor,
    McpAuthGuard,
    ExposureContractGuard,
    ToolPermissionGuard,
    // ── Permission narrative builder (Task 6) ──────────────────────────────────
    PermissionNarrativeBuilder,
    { provide: PERMISSION_NARRATIVE_BUILDER, useExisting: PermissionNarrativeBuilder },
    // ── Router prompt builder (Task 7) ─────────────────────────────────────────
    RouterPromptBuilder,
    { provide: ROUTER_PROMPT_BUILDER, useExisting: RouterPromptBuilder },
    // ── Sub-agent retriever (Task 8) ───────────────────────────────────────────
    SubAgentRetriever,
    { provide: SUB_AGENT_RETRIEVER, useExisting: SubAgentRetriever },
    // ── Router decision parser (Task 9) ────────────────────────────────────────
    RouterDecisionParser,
    { provide: ROUTER_DECISION_PARSER, useExisting: RouterDecisionParser },
    // ── Router LLM client (Task 9) ─────────────────────────────────────────────
    RouterLlmClient,
    { provide: ROUTER_LLM_CLIENT, useExisting: RouterLlmClient },
    // ── Router session orchestrator (Task 10) ──────────────────────────────────
    RouterSessionOrchestrator,
    { provide: ROUTER_SESSION_ORCHESTRATOR, useExisting: RouterSessionOrchestrator },
    // ── Gateway pipeline (Task 5) ──────────────────────────────────────────────
    ToolRegistry,
    TrpcCallerImpl,
    ToolGateway,
    // ── Sub-agent registry (Task 3) ────────────────────────────────────────────
    SubAgentRegistry,
    { provide: SUB_AGENT_REGISTRY, useExisting: SubAgentRegistry },
    // ── Intent registry (Task 4) ───────────────────────────────────────────────
    IntentRegistry,
    { provide: INTENT_REGISTRY, useExisting: IntentRegistry },
    // ── Tool descriptor embedder (Plan 02.5 Task 1) ────────────────────────────
    ToolDescriptorEmbedder,
    { provide: TOOL_DESCRIPTOR_EMBEDDER, useExisting: ToolDescriptorEmbedder },
    // ── Tool retriever (Plan 02.5 Task 2) ──────────────────────────────────────
    ToolRetriever,
    { provide: TOOL_RETRIEVER, useExisting: ToolRetriever },
    // ── When-to-use collision linter (Plan 02.5 Task 3) ───────────────────────
    WhenToUseCollisionLinter,
    { provide: WHEN_TO_USE_COLLISION_LINTER, useExisting: WhenToUseCollisionLinter },
    // ── Retrieval quality scorer (Plan 02.5 Task 4) ────────────────────────────
    RetrievalQualityScorer,
    { provide: RETRIEVAL_QUALITY_SCORER, useExisting: RetrievalQualityScorer },
    // ── Plan 04 — Memory L1-L4 + Conversation State ───────────────────────────
    // SaveQueue: @Injectable — constructor-injected CONVERSATION_MESSAGE_REPOSITORY
    SaveQueue,
    // L3PreferenceService: @Injectable — needs L3_PREFERENCE_REPOSITORY + KernelAuditFacade
    L3PreferenceService,
    // WindowBuilder: plain class — constructed via useFactory
    {
      provide: WINDOW_BUILDER,
      inject: [CONVERSATION_MESSAGE_REPOSITORY],
      useFactory: (msgRepo: ConversationMessageRepository) => new WindowBuilder(msgRepo),
    },
    // Summarizer: plain class — constructed via useFactory
    // AiClient stub: no-op at Phase 1; replaced in Phase 4 when summarization activates.
    {
      provide: SUMMARIZER,
      inject: [PgBossService, CONVERSATION_REPOSITORY, CONVERSATION_MESSAGE_REPOSITORY],
      useFactory: (
        pgBoss: PgBossService,
        convRepo: ConversationRepository,
        msgRepo: ConversationMessageRepository,
      ) => new Summarizer(pgBoss, { generateText: async () => '' }, convRepo, msgRepo),
    },
    // GDPRErasurePipeline: plain class — constructed via useFactory
    {
      provide: GDPR_ERASURE_PIPELINE,
      inject: [
        CONVERSATION_MESSAGE_REPOSITORY,
        L3_PREFERENCE_REPOSITORY,
        SCRATCHPAD_REPOSITORY,
        SEMANTIC_INDEX_REPOSITORY,
        KernelAuditFacade,
      ],
      useFactory: (
        msgRepo: ConversationMessageRepository,
        l3Repo: L3PreferenceRepository,
        scratchpadRepo: ScratchpadRepository,
        semanticIndex: SemanticIndexRepository,
        kernelAudit: KernelAuditFacade,
      ) => new GDPRErasurePipeline(msgRepo, l3Repo, scratchpadRepo, semanticIndex, kernelAudit),
    },
    // ConversationRetentionScheduler: plain class — daily pg-boss cron for 90-day archive
    {
      provide: CONVERSATION_RETENTION_SCHEDULER,
      inject: [PgBossService, CONVERSATION_REPOSITORY],
      useFactory: (pgBoss: PgBossService, convRepo: ConversationRepository) =>
        new ConversationRetentionScheduler(pgBoss, convRepo, new NullTenantLister()),
    },
    // ── Composition-attack monitor (Plan 07 Task 6) ───────────────────────────
    CompositionMonitorWorker,
    // ── Plan 07 Task 7 — Observability meta-metrics + quota recorder ──────────
    TurnSamplingDecisionRecorder,
    LeakCanaryScheduler,
    ToolInvocationAuditRecorder,
    // ── Plan 05 — Cost / budget / rate-limiting / canary / throttle ───────────
    PricingResolver,
    OpenAiUsageExtractor,
    CostRecorder,
    BudgetChecker,
    RateLimiter,
    QualityCanarySubscription,
    ApprovalInboxThrottle,
    AdminBudgetOps,
    // ── Plan 08 — Drafts + Approval ───────────────────────────────────────────
    { provide: DRAFT_REPOSITORY, useClass: DrizzleDraftRepository },
    ApprovalExecutorDelegationMinter,
    DraftTierClassifier,
    FlowPolicyResolver,
    DraftSink,
    DraftProposer,
    ExecuteApprovedDraftWorker,
    DraftExpirySweeper,
    // ── Plan 06 — Streaming + SSE + Cancellation ──────────────────────────────
    ActiveTurnRegistry,
    RequestContextDiscipline,
    CrossPodCancelService,
    // JwtService (custom, common/auth) — forward from global JWT_SERVICE token
    {
      provide: JwtService,
      useExisting: JWT_SERVICE,
    },
  ],
  exports: [
    AgentsQueryFacade,
    SUB_AGENT_REGISTRY,
    INTENT_REGISTRY,
    PERMISSION_NARRATIVE_BUILDER,
    ROUTER_PROMPT_BUILDER,
    SUB_AGENT_RETRIEVER,
    ROUTER_DECISION_PARSER,
    ROUTER_LLM_CLIENT,
    ROUTER_SESSION_ORCHESTRATOR,
    TOOL_DESCRIPTOR_EMBEDDER,
    TOOL_RETRIEVER,
    WHEN_TO_USE_COLLISION_LINTER,
    RETRIEVAL_QUALITY_SCORER,
    // Plan 04
    CONVERSATION_REPOSITORY,
    CONVERSATION_MESSAGE_REPOSITORY,
    L3_PREFERENCE_REPOSITORY,
    SCRATCHPAD_REPOSITORY,
    SEMANTIC_INDEX_REPOSITORY,
    SaveQueue,
    L3PreferenceService,
    WINDOW_BUILDER,
    SUMMARIZER,
    GDPR_ERASURE_PIPELINE,
  ],
})
export class AgentsModule implements OnModuleInit, OnApplicationBootstrap {
  constructor(
    private readonly createSession: CreateSessionHandler,
    private readonly sendMessage: SendMessageHandler,
    private readonly dismissInsight: DismissInsightHandler,
    private readonly listSessions: ListSessionsHandler,
    private readonly listInsights: ListInsightsHandler,
    private readonly toolRegistry: ToolRegistry,
    private readonly subAgentRegistry: SubAgentRegistry,
    private readonly intentRegistry: IntentRegistry,
    private readonly toolDescriptorEmbedder: ToolDescriptorEmbedder,
    @Inject(SUMMARIZER) private readonly summarizer: Summarizer,
    private readonly l3PreferenceService: L3PreferenceService,
    @Inject(CONVERSATION_REPOSITORY) private readonly conversationRepo: ConversationRepository,
    @Inject(CONVERSATION_RETENTION_SCHEDULER)
    private readonly retentionScheduler: ConversationRetentionScheduler,
    private readonly compositionMonitorWorker: CompositionMonitorWorker,
    private readonly leakCanaryScheduler: LeakCanaryScheduler,
    private readonly pgBossService: PgBossService,
    private readonly executeApprovedDraftWorker: ExecuteApprovedDraftWorker,
    private readonly draftExpirySweeper: DraftExpirySweeper,
    @Inject(DRAFT_REPOSITORY) private readonly draftRepo: IDraftRepository,
  ) {}

  async onModuleInit(): Promise<void> {
    setAgentSessionHandlers({
      createSession: this.createSession,
      listSessions: this.listSessions,
      sendMessage: this.sendMessage,
    })
    setAgentInsightHandlers({
      listInsights: this.listInsights,
      dismissInsight: this.dismissInsight,
    })
    setPreferencesService(this.l3PreferenceService)
    setConversationRepository(this.conversationRepo)
    setDraftRepository(this.draftRepo)

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
    // Errors from registry boot propagate to NestJS, failing app startup intentionally.
    // Registry misconfiguration (duplicate keys, unknown tools, missing slugs, etc.)
    // MUST be fixed before deployment — there is no degraded-mode fallback.
    this.subAgentRegistry.boot(descriptors, this.toolRegistry)

    // Step 2.5: Boot the tool descriptor embedder AFTER the tool registry has loaded.
    // ensureEmbedded upserts embeddings for any tool whose (tool_name, content_hash)
    // pair is missing from the DB. buildInMemoryIndex loads the latest vector per
    // tool_name into the in-memory Map for runtime retrieval.
    const allTools = this.toolRegistry.listAgentTools()
    await this.toolDescriptorEmbedder.ensureEmbedded(allTools)
    await this.toolDescriptorEmbedder.buildInMemoryIndex(allTools)

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
    // Errors from registry boot propagate to NestJS, failing app startup intentionally.
    // Registry misconfiguration (duplicate keys, unknown tools, missing slugs, etc.)
    // MUST be fixed before deployment — there is no degraded-mode fallback.
    this.intentRegistry.boot(intentDescriptors)
  }
  async onApplicationBootstrap(): Promise<void> {
    // Step 4: Register Plan 04 pg-boss workers.
    // Summarizer worker fires post-turn to generate async summaries (R-04.24).
    // SUMMARIZER token is a Symbol so we use the injected instance directly.
    await this.summarizer.registerWorkers()

    // Step 5: Register retention scheduler — daily cron to archive idle conversations (R-04.27).
    await this.retentionScheduler.registerWorkers()

    // Step 6: Register composition-attack monitor (Plan 07 Task 6, R-07.46).
    // Best-effort, post-turn async job — never blocks tool calls (Tenet #9).
    await this.pgBossService.registerWorker<CompositionMonitorJobData>(
      'observability-composition-monitor',
      async (jobs) => {
        for (const job of jobs) {
          await this.compositionMonitorWorker.handle(job)
        }
      },
    )

    // Step 7: Register leak canary job (Plan 07 Task 7, R-07.§8).
    // Daily 3am UTC scan for cross-tenant trace leaks — MVP stub records 'clean'.
    await this.leakCanaryScheduler.registerJob()

    // Step 8: Register execute-approved-draft worker (Plan 08 T5).
    // Processes approved drafts enqueued by DraftProposer after approval.
    await this.pgBossService.registerWorker<Parameters<ExecuteApprovedDraftWorker['handle']>[0]>(
      'agents.execute-approved-draft',
      async (jobs) => {
        for (const job of jobs) {
          await this.executeApprovedDraftWorker.handle(job.data)
        }
      },
    )

    // Step 9: Register draft expiry sweeper (Plan 08 T5).
    // Runs every 15 minutes to mark pending-expired drafts as 'expired'.
    await this.draftExpirySweeper.registerJob(this.pgBossService)
  }
}
