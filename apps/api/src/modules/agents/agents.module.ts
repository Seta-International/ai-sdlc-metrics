import { Inject, Module, type OnModuleInit, type OnApplicationBootstrap } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { ActiveTurnRegistry } from './application/services/active-turn-registry'
import { RequestContextDiscipline } from './application/services/request-context-discipline'
import { CrossPodCancelService } from './infrastructure/cross-pod-cancel'
import { AgentTurnController } from './interface/http/agent-turn-controller'
import { AgentCancelController } from './interface/http/agent-cancel-controller'
import { JwtService } from '../../common/auth/jwt.service'
import { JWT_SERVICE } from '../../common/auth/auth.module'
import { AgentPermissionService } from './application/services/agent-permission.service'
import { AgentToolExecutor } from './application/services/agent-tool-executor'
import { McpAuthGuard } from './infrastructure/guards/mcp-auth.guard'
import { ExposureContractGuard } from './infrastructure/guards/exposure-contract.guard'
import { ToolPermissionGuard } from './infrastructure/guards/tool-permission.guard'
import { KernelModule } from '../kernel/kernel.module'
import { KernelAuditFacade } from '../kernel/application/facades/kernel-audit.facade'
import { KernelQueryFacade } from '../kernel/application/facades/kernel-query.facade'
import { AdminModule } from '../admin/admin.module'
import { AdminQueryFacade } from '../admin/application/facades/admin-query.facade'
import { AGENT_CHAT_SESSION_REPOSITORY } from './domain/repositories/agent-chat-session.repository'
import { AGENT_SESSION_PORT } from './domain/ports/agent-session.port'
import { STORED_SUB_AGENT_PORT } from './domain/ports/stored-sub-agent.port'
import { AGENT_MESSAGE_REPOSITORY } from './domain/repositories/agent-message.repository'
import { AGENT_INSIGHT_REPOSITORY } from './domain/repositories/agent-insight.repository'
import { PROMPT_STORE } from './domain/ports/prompt-store.port'
import { NARRATIVE_STORE } from './domain/ports/narrative-store.port'
import { CONVERSATION_REPOSITORY } from './domain/repositories/conversation.repository'
import { CONVERSATION_MESSAGE_REPOSITORY } from './domain/repositories/conversation-message.repository'
import { L3_PREFERENCE_REPOSITORY } from './domain/repositories/l3-preference.repository'
import { SCRATCHPAD_REPOSITORY } from './domain/repositories/scratchpad.repository'
import { SEMANTIC_INDEX_REPOSITORY } from './domain/repositories/semantic-index.repository'
import { DrizzleAgentChatSessionRepository } from './infrastructure/repositories/drizzle-agent-chat-session.repository'
import { DrizzleAgentSessionRepository } from './infrastructure/repositories/drizzle-agent-session.repository'
import { DrizzleStoredSubAgentRepository } from './infrastructure/repositories/drizzle-stored-sub-agent.repository'
import { DrizzleAgentMessageRepository } from './infrastructure/repositories/drizzle-agent-message.repository'
import { DrizzleAgentInsightRepository } from './infrastructure/repositories/drizzle-agent-insight.repository'
import { DrizzlePromptStoreRepository } from './infrastructure/repositories/drizzle-prompt-store.repository'
import { DrizzleNarrativeStoreRepository } from './infrastructure/repositories/drizzle-narrative-store.repository'
import { DrizzleConversationRepository } from './infrastructure/repositories/drizzle-conversation.repository'
import { DrizzleConversationMessageRepository } from './infrastructure/repositories/drizzle-conversation-message.repository'
import { DrizzleL3PreferenceRepository } from './infrastructure/repositories/drizzle-l3-preference.repository'
import { DrizzleScratchpadRepository } from './infrastructure/repositories/drizzle-scratchpad.repository'
import { DrizzleSemanticIndexRepository } from './infrastructure/repositories/drizzle-semantic-index.repository'
import { CreateSessionHandler } from './application/commands/create-session.handler'
import { SendMessageHandler } from './application/commands/send-message.handler'
import { DismissInsightHandler } from './application/commands/dismiss-insight.handler'
import { ListSessionsHandler } from './application/queries/list-sessions.handler'
import { ListInsightsHandler } from './application/queries/list-insights.handler'
import { setAgentSessionHandlers } from './interface/trpc/session.router'
import { setAgentInsightHandlers } from './interface/trpc/insight.router'
import { setPreferencesService } from './interface/trpc/preferences.router'
import { setConversationRepository } from './interface/trpc/conversation.router'
import { setDraftRepository } from './interface/trpc/draft-audit.router'
import { setDraftApprovalService } from './interface/trpc/draft-approval.router'
import { setScheduleHandlers } from './interface/trpc/schedule-ui-facade'
import { setRolloutHandlers } from './interface/trpc/rollout.router'
import { setReadinessHandlers } from './interface/trpc/readiness.router'
import { SCHEDULE_REPOSITORY } from './domain/repositories/schedule.repository'
import {
  SCHEDULE_RUN_REPOSITORY,
  type IScheduleRunRepository,
} from './domain/repositories/schedule-run.repository'
import { DrizzleScheduleRepository } from './infrastructure/repositories/drizzle-schedule.repository'
import { DrizzleScheduleRunRepository } from './infrastructure/repositories/drizzle-schedule-run.repository'
import { ScheduleRepository } from './application/services/schedule-repository'
import { DelegationLifecycle } from './application/services/delegation-lifecycle'
import { SchedulerPrincipal } from './application/services/scheduler-principal'
import { TaintSeedDetector } from './application/services/taint-seed-detector'
import { ScheduledTurnSpawner } from './application/services/scheduled-turn-spawner'
import { ScheduledTurnService } from './application/services/scheduled-turn-service'
import { AgentEventRouter } from './application/services/agent-event-router'
import { ScheduledTurnWorker } from './infrastructure/workers/scheduled-turn-worker'
import {
  SCHEDULED_TURN_QUEUE,
  type ScheduledTurnJob,
} from './application/services/scheduled-turn-contracts'
import { DelegationExpirySweeper } from './infrastructure/workers/delegation-expiry-sweep'
import { SemanticResultCache } from './infrastructure/cache/semantic-result-cache'
import { SemanticCacheSweeper } from './infrastructure/workers/semantic-cache-sweeper'
import { KernelDelegationFacade } from '../kernel/application/facades/kernel-delegation.facade'
import {
  PermissionNarrativeBuilder,
  PERMISSION_NARRATIVE_BUILDER,
} from './application/services/permission-narrative-builder'
import {
  RouterPromptBuilder,
  ROUTER_PROMPT_BUILDER,
} from './application/services/router-prompt-builder'
import { SubAgentRetriever, SUB_AGENT_RETRIEVER } from './application/services/sub-agent-retriever'
import {
  RouterDecisionParser,
  ROUTER_DECISION_PARSER,
} from './application/services/router-decision-parser'
import { RouterLlmClient, ROUTER_LLM_CLIENT } from './infrastructure/llm/router-llm-client'
import {
  RouterSessionOrchestrator,
  ROUTER_SESSION_ORCHESTRATOR,
} from './application/services/router-session-orchestrator'
import { BoundedExecutor, BOUNDED_EXECUTOR } from './application/services/bounded-executor'
import {
  TurnPipelineRunner,
  TURN_PIPELINE_RUNNER,
  RUN_PIPELINE_FN,
} from './application/services/turn-pipeline-runner'
import { createRunPipelineFn } from './application/factories/run-pipeline.factory'
import { ToolRegistry, TOOL_REGISTRY } from './infrastructure/tool-registry/tool-registry'
import { TrpcCallerImpl } from './application/services/trpc-caller'
import { ToolGateway } from './application/services/tool-gateway'
import { TOOL_GATEWAY } from './application/services/tool-gateway-contracts'
import {
  OpenAiSubAgentLlmClient,
  SUB_AGENT_LLM_CLIENT,
} from './infrastructure/llm/sub-agent-llm-client'
import {
  OpenAiSynthesizerLlmClient,
  SYNTHESIZER_LLM_CLIENT,
} from './infrastructure/llm/synthesizer-llm-client'
import { DisabledSummarizerAiClient } from './infrastructure/llm/disabled-summarizer-client'
import { getAppRouter } from '../../common/trpc/app-router'
import { SubAgentRegistry, SUB_AGENT_REGISTRY } from './infrastructure/registry/sub-agent-registry'
import { IntentRegistry, INTENT_REGISTRY } from './infrastructure/registry/intents/intent-registry'
import {
  ToolDescriptorEmbedder,
  TOOL_DESCRIPTOR_EMBEDDER,
} from './infrastructure/retrieval/tool-descriptor-embedder'
import { ToolRetriever, TOOL_RETRIEVER } from './infrastructure/retrieval/tool-retriever'
import {
  WhenToUseCollisionLinter,
  WHEN_TO_USE_COLLISION_LINTER,
} from './application/services/when-to-use-collision-linter'
import {
  RetrievalQualityScorer,
  RETRIEVAL_QUALITY_SCORER,
} from './application/services/retrieval-quality-scorer'
import { SaveQueue } from './application/services/save-queue'
import { L3PreferenceService } from './application/services/l3-preferences'
import { WindowBuilder } from './application/services/window-builder'
import { Summarizer } from './application/services/summarizer'
import { GDPRErasurePipeline } from './application/services/gdpr-erasure'
import { ConversationRetentionScheduler } from './application/services/conversation-retention-scheduler'
import {
  CompositionMonitorWorker,
  type CompositionMonitorJobData,
} from './infrastructure/jobs/composition-monitor.worker'
import { LeakCanaryScheduler } from './infrastructure/jobs/leak-canary.scheduler'
import { TurnSamplingDecisionRecorder } from './application/services/turn-sampling-decision-recorder'
import { ToolInvocationAuditRecorder } from './application/services/tool-invocation-audit-recorder'
import { ObservabilityContextFactory } from './application/services/observability-context'
import { FlowIdPropagation } from './application/services/flow-id-propagation'
import { PricingResolver } from './infrastructure/pricing/pricing-resolver'
import { OpenAiUsageExtractor } from './infrastructure/adapters/openai-usage-extractor'
import { KernelTenantLister } from './infrastructure/adapters/kernel-tenant-lister'
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
import { DraftExpirySweeper } from './infrastructure/workers/sweep-expired-drafts'
import { WRITE_DEDUP_REPOSITORY } from './domain/repositories/write-dedup.repository'
import { DrizzleWriteDedupRepository } from './infrastructure/repositories/drizzle-write-dedup.repository'
import { SweepExpiredWriteDedupWorker } from './infrastructure/workers/sweep-expired-write-dedup'
import { DraftApprovalService } from './application/services/draft-approval.service'
import type { ConversationRepository } from './domain/repositories/conversation.repository'
import type { ConversationMessageRepository } from './domain/repositories/conversation-message.repository'
import type { L3PreferenceRepository } from './domain/repositories/l3-preference.repository'
import type { ScratchpadRepository } from './domain/repositories/scratchpad.repository'
import type { SemanticIndexRepository } from './domain/repositories/semantic-index.repository'
import type { IDraftRepository } from './domain/repositories/draft.repository'
import { PgBossService } from '../../common/jobs/pg-boss.service'
import { DB_TOKEN, BASE_DB_TOKEN } from '../../common/db/db.module'
import { RequestDbContextService } from '../../common/db/request-db-context.service'
import type { Db } from '@future/db'
// Module sub-agent barrels.
//   • Adding a sub-agent to an EXISTING module: re-export it from that module's
//     barrel (agent/sub-agents/index.ts). No changes here are needed.
//   • Adding sub-agents for a NEW domain module: add a new import below and
//     include the descriptor(s) in the `descriptors` array in onModuleInit().
import { plannerReadOnlySubAgent } from '../planner/agent/sub-agents'
import { RolloutResolver } from './application/services/rollout-resolver'
import { ShadowDiffScorer } from './application/services/shadow-diff-scorer'
import { ShadowExecutor } from './application/services/shadow-executor'
import { ShadowTurnWorker } from './infrastructure/workers/shadow-turn-worker'
import { RegressionSignalMonitor } from './application/services/regression-signal-monitor'
import { AutoRollbackOrchestrator } from './application/services/auto-rollback-orchestrator'
import {
  IterativeOrchestrator,
  ITERATIVE_ORCHESTRATOR,
  I_SUB_AGENT_RUNNER,
  I_SYNTHESIZER,
} from './application/services/iterative-orchestrator'
import { SubAgentRunnerAdapter } from './application/services/sub-agent-runner-adapter'
import { SynthesizerAdapter } from './application/services/synthesizer-adapter'
import { IterationCeilingEnforcer } from './application/services/iteration-ceiling-enforcer'
import { CompletionScorerRunner } from './application/services/completion-scorer-runner'
import { IterativeRePlanner } from './application/services/iterative-replanner'
import { AGENT_ITERATION_REPOSITORY } from './domain/repositories/agent-iteration.repository'
import { DrizzleAgentIterationRepository } from './infrastructure/repositories/drizzle-agent-iteration.repository'
import {
  READINESS_CHECK_REPOSITORY,
  type ReadinessCheckRepository,
} from './domain/repositories/readiness-check.repository'
import {
  GA_READINESS_STATE_REPOSITORY,
  type GaReadinessStateRepository,
} from './domain/repositories/ga-readiness-state.repository'
import { RUNBOOK_DRY_RUN_REPOSITORY } from './domain/repositories/runbook-dry-run.repository'
import { P1_INCIDENT_REPOSITORY } from './domain/repositories/p1-incident.repository'
import { COST_RECONCILIATION_REPOSITORY } from './domain/repositories/cost-reconciliation.repository'
import { METRICS_QUERY_PORT } from './domain/ports/metrics-query.port'
import { CI_STATE_PORT } from './domain/ports/ci-state.port'
import { GA_METRICS_PORT } from './domain/ports/ga-metrics.port'
import { DrizzleReadinessCheckRepository } from './infrastructure/repositories/drizzle-readiness-check.repository'
import { DrizzleGaReadinessStateRepository } from './infrastructure/repositories/drizzle-ga-readiness-state.repository'
import { DrizzleRunbookDryRunRepository } from './infrastructure/repositories/drizzle-runbook-dry-run.repository'
import { DrizzleP1IncidentRepository } from './infrastructure/repositories/drizzle-p1-incident.repository'
import { DrizzleCostReconciliationRepository } from './infrastructure/repositories/drizzle-cost-reconciliation.repository'
import { StubMetricsQuery } from './infrastructure/metrics/stub-metrics-query'
import { StubGaMetrics } from './infrastructure/metrics/stub-ga-metrics'
import { StubCiState } from './infrastructure/ci/stub-ci-state'
import {
  ReadinessValidator,
  CRITERION_EVALUATORS,
} from './application/services/readiness-validator'
import { GaReadinessComputer } from './application/services/ga-readiness-computer'
import { RunbookDryRunScheduler } from './application/services/runbook-dry-run-scheduler'
import { CostReconciliationJob } from './application/services/cost-reconciliation-job'
import { QuarterlyRedTeamDrill } from './application/services/quarterly-red-team-drill'
import { ScaleProbeRunner } from './application/services/scale-probe-runner'
import { ExtensibilityInvariantAudit } from './application/services/extensibility-invariant-audit'
import { FlowCorrelationProbe } from './application/services/flow-correlation-probe'
import { ReadinessHourlyWorker } from './infrastructure/workers/readiness-hourly-worker'
import { CostReconciliationWorker } from './infrastructure/workers/cost-reconciliation-worker'
import { FlowCorrelationWorker } from './infrastructure/workers/flow-correlation-worker'
import { ReliabilityTurnCompletedRateEvaluator } from './application/services/criterion-evaluators/reliability-turn-completed-rate.evaluator'
import { ReliabilityUncaughtErrorRateEvaluator } from './application/services/criterion-evaluators/reliability-uncaught-error-rate.evaluator'
import { ReliabilityProviderFallbackRateEvaluator } from './application/services/criterion-evaluators/reliability-provider-fallback-rate.evaluator'
import { ReliabilitySingleAbortPathEvaluator } from './application/services/criterion-evaluators/reliability-single-abort-path.evaluator'
import { ReliabilityDraftsDiscardedOnAbortEvaluator } from './application/services/criterion-evaluators/reliability-drafts-discarded-on-abort.evaluator'
import { SecurityCrossTenantLeakSuiteEvaluator } from './application/services/criterion-evaluators/security-cross-tenant-leak-suite.evaluator'
import { SecurityRlsUnbypassableEvaluator } from './application/services/criterion-evaluators/security-rls-unbypassable.evaluator'
import { SecurityIdentityKeyWriteDisciplineEvaluator } from './application/services/criterion-evaluators/security-identity-key-write-discipline.evaluator'
import { SecurityTaintPropagatesApprovalEvaluator } from './application/services/criterion-evaluators/security-taint-propagates-approval.evaluator'
import { SecurityKernelAuditPerToolCallEvaluator } from './application/services/criterion-evaluators/security-kernel-audit-per-tool-call.evaluator'
import { CostPerTurnVarianceEvaluator } from './application/services/criterion-evaluators/cost-per-turn-variance.evaluator'
import { CostCacheHitRateEvaluator } from './application/services/criterion-evaluators/cost-cache-hit-rate.evaluator'
import { CostBudgetRefusalPrecisionEvaluator } from './application/services/criterion-evaluators/cost-budget-refusal-precision.evaluator'
import { CostAdapterDroppedCacheFieldsEvaluator } from './application/services/criterion-evaluators/cost-adapter-dropped-cache-fields.evaluator'
import { CostTierShiftUserNoticeRateEvaluator } from './application/services/criterion-evaluators/cost-tier-shift-user-notice-rate.evaluator'
import { ObservabilityTraceCorrelationEvaluator } from './application/services/criterion-evaluators/observability-trace-correlation.evaluator'
import { ObservabilitySamplingTriggerCoverageEvaluator } from './application/services/criterion-evaluators/observability-sampling-trigger-coverage.evaluator'
import { ObservabilityCanaryDetectsDegradationEvaluator } from './application/services/criterion-evaluators/observability-canary-detects-degradation.evaluator'
import { ObservabilityPiiRedactionEvaluator } from './application/services/criterion-evaluators/observability-pii-redaction.evaluator'
import { ObservabilityReplayCoverageEvaluator } from './application/services/criterion-evaluators/observability-replay-coverage.evaluator'
import { RolloutGoldenTraceCiGateEvaluator } from './application/services/criterion-evaluators/rollout-golden-trace-ci-gate.evaluator'
import { RolloutCanaryStagesEvaluator } from './application/services/criterion-evaluators/rollout-canary-stages.evaluator'
import { RolloutShadowModeExercisedEvaluator } from './application/services/criterion-evaluators/rollout-shadow-mode-exercised.evaluator'
import { RolloutVersionPinningComplianceEvaluator } from './application/services/criterion-evaluators/rollout-version-pinning-compliance.evaluator'
import { RolloutIntentSlugCoverageEvaluator } from './application/services/criterion-evaluators/rollout-intent-slug-coverage.evaluator'
import { ReplayHarness, REPLAY_HARNESS } from './application/services/replay-harness'
import { ScorerRegistry, SCORER_REGISTRY } from './application/services/scorer-registry'
import { GoldenTraceRunner, GOLDEN_TRACE_RUNNER } from './application/services/golden-trace-runner'
import {
  QualityCanaryScheduler,
  QUALITY_CANARY_SCHEDULER,
} from './application/services/quality-canary-scheduler'
import {
  CanaryQueryRotator,
  CANARY_QUERY_ROTATOR,
} from './application/services/canary-query-rotator'
import {
  DegradedTierFallback,
  DEGRADED_TIER_FALLBACK,
} from './application/services/degraded-tier-fallback'
import {
  ConfidenceCalibrationService,
  CONFIDENCE_CALIBRATION_SERVICE,
} from './application/services/confidence-calibration-service'
import {
  IntentDriftScorer,
  INTENT_DRIFT_SCORER,
  TOOL_REGISTRY_TOKEN,
} from './application/services/intent-drift-scorer'
import { GOLDEN_TRACE_REPOSITORY } from './domain/repositories/golden-trace.repository'
import { CANARY_RUN_REPOSITORY } from './domain/repositories/canary-run.repository'
import { CANARY_QUERY_REPOSITORY } from './domain/repositories/canary-query.repository'
import { SCORER_REGISTRATION_REPOSITORY } from './domain/repositories/scorer-registration.repository'
import { DrizzleGoldenTraceRepository } from './infrastructure/repositories/drizzle-golden-trace.repository'
import { DrizzleCanaryRunRepository } from './infrastructure/repositories/drizzle-canary-run.repository'
import { DrizzleCanaryQueryRepository } from './infrastructure/repositories/drizzle-canary-query.repository'
import { DrizzleScorerRegistrationRepository } from './infrastructure/repositories/drizzle-scorer-registration.repository'
// Module intent barrels.
//   • Adding an intent to an EXISTING module: re-export it from that module's
//     barrel (agent/intents/index.ts). No changes here are needed.
//   • Adding intents for a NEW domain module: add a new import below and
//     include the descriptor(s) in the `intentDescriptors` array in onModuleInit().
import { unclassifiedIntent } from './intents'
import { listMyTasksIntent, listMyPlansIntent, listEvidenceIntent } from '../planner/agent/intents'
import { viewMyProfileIntent } from '../people/agent/intents'
import { listMyAssignmentsIntent } from '../projects/agent/intents'

export const WINDOW_BUILDER = Symbol('WINDOW_BUILDER')
export const SUMMARIZER = Symbol('SUMMARIZER')
export const GDPR_ERASURE_PIPELINE = Symbol('GDPR_ERASURE_PIPELINE')
export const CONVERSATION_RETENTION_SCHEDULER = Symbol('CONVERSATION_RETENTION_SCHEDULER')

@Module({
  imports: [
    KernelModule,
    AdminModule,
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
    { provide: AGENT_CHAT_SESSION_REPOSITORY, useClass: DrizzleAgentChatSessionRepository },
    { provide: AGENT_SESSION_PORT, useClass: DrizzleAgentSessionRepository },
    { provide: STORED_SUB_AGENT_PORT, useClass: DrizzleStoredSubAgentRepository },
    { provide: AGENT_MESSAGE_REPOSITORY, useClass: DrizzleAgentMessageRepository },
    { provide: AGENT_INSIGHT_REPOSITORY, useClass: DrizzleAgentInsightRepository },
    { provide: PROMPT_STORE, useClass: DrizzlePromptStoreRepository },
    { provide: NARRATIVE_STORE, useClass: DrizzleNarrativeStoreRepository },
    { provide: CONVERSATION_REPOSITORY, useClass: DrizzleConversationRepository },
    { provide: CONVERSATION_MESSAGE_REPOSITORY, useClass: DrizzleConversationMessageRepository },
    { provide: L3_PREFERENCE_REPOSITORY, useClass: DrizzleL3PreferenceRepository },
    { provide: SCRATCHPAD_REPOSITORY, useClass: DrizzleScratchpadRepository },
    { provide: SEMANTIC_INDEX_REPOSITORY, useClass: DrizzleSemanticIndexRepository },
    CreateSessionHandler,
    SendMessageHandler,
    DismissInsightHandler,
    ListSessionsHandler,
    ListInsightsHandler,
    AgentPermissionService,
    AgentToolExecutor,
    McpAuthGuard,
    ExposureContractGuard,
    ToolPermissionGuard,
    PermissionNarrativeBuilder,
    { provide: PERMISSION_NARRATIVE_BUILDER, useExisting: PermissionNarrativeBuilder },
    RouterPromptBuilder,
    { provide: ROUTER_PROMPT_BUILDER, useExisting: RouterPromptBuilder },
    SubAgentRetriever,
    { provide: SUB_AGENT_RETRIEVER, useExisting: SubAgentRetriever },
    RouterDecisionParser,
    { provide: ROUTER_DECISION_PARSER, useExisting: RouterDecisionParser },
    RouterLlmClient,
    { provide: ROUTER_LLM_CLIENT, useExisting: RouterLlmClient },
    RouterSessionOrchestrator,
    { provide: ROUTER_SESSION_ORCHESTRATOR, useExisting: RouterSessionOrchestrator },
    BoundedExecutor,
    { provide: BOUNDED_EXECUTOR, useExisting: BoundedExecutor },
    TurnPipelineRunner,
    { provide: TURN_PIPELINE_RUNNER, useExisting: TurnPipelineRunner },
    {
      // RUN_PIPELINE_FN — the live composition closure consumed by
      // TurnPipelineRunner. Logic lives in `application/factories/run-pipeline.factory.ts`
      // so this file stays focused on DI wiring; the closure composes
      // RouterSessionOrchestrator, BoundedExecutor, WindowBuilder, plus
      // KernelQueryFacade + AdminQueryFacade (cross-module reads via public
      // facades only — see CLAUDE.md DDD rule).
      provide: RUN_PIPELINE_FN,
      inject: [
        ROUTER_SESSION_ORCHESTRATOR,
        BOUNDED_EXECUTOR,
        WINDOW_BUILDER,
        KernelQueryFacade,
        AdminQueryFacade,
      ],
      useFactory: (
        routerOrchestrator: RouterSessionOrchestrator,
        boundedExecutor: BoundedExecutor,
        windowBuilder: WindowBuilder,
        kernelQuery: KernelQueryFacade,
        adminQuery: AdminQueryFacade,
      ) =>
        createRunPipelineFn({
          routerOrchestrator,
          boundedExecutor,
          windowBuilder,
          kernelQuery,
          adminQuery,
        }),
    },
    ToolRegistry,
    // TrpcCallerImpl requires BASE_DB_TOKEN (raw pool — not the request-bound DB_TOKEN proxy)
    // so that gateway-invoked dry-run calls open a real Postgres transaction for rollback
    // isolation. Using DB_TOKEN would cause nested-transaction issues with
    // RLS session state and violate the single-PoolClient-per-request rule.
    //
    // RequestDbContextService is also injected so dry-run can publish the transaction-bound
    // Db into the request CLS scope — DI'd DB_TOKEN proxies then route through the rollback
    // tx for the duration of the procedure call (audit Theme F closure).
    {
      provide: TrpcCallerImpl,
      inject: [BASE_DB_TOKEN, RequestDbContextService],
      useFactory: (db: Db, requestDbContext: RequestDbContextService) =>
        new TrpcCallerImpl(undefined, db, requestDbContext),
    },
    ToolGateway,
    { provide: TOOL_GATEWAY, useExisting: ToolGateway },
    { provide: TOOL_REGISTRY, useExisting: ToolRegistry },
    OpenAiSubAgentLlmClient,
    { provide: SUB_AGENT_LLM_CLIENT, useExisting: OpenAiSubAgentLlmClient },
    OpenAiSynthesizerLlmClient,
    { provide: SYNTHESIZER_LLM_CLIENT, useExisting: OpenAiSynthesizerLlmClient },
    SubAgentRegistry,
    { provide: SUB_AGENT_REGISTRY, useExisting: SubAgentRegistry },
    IntentRegistry,
    { provide: INTENT_REGISTRY, useExisting: IntentRegistry },
    ToolDescriptorEmbedder,
    { provide: TOOL_DESCRIPTOR_EMBEDDER, useExisting: ToolDescriptorEmbedder },
    ToolRetriever,
    { provide: TOOL_RETRIEVER, useExisting: ToolRetriever },
    WhenToUseCollisionLinter,
    { provide: WHEN_TO_USE_COLLISION_LINTER, useExisting: WhenToUseCollisionLinter },
    RetrievalQualityScorer,
    { provide: RETRIEVAL_QUALITY_SCORER, useExisting: RetrievalQualityScorer },
    SaveQueue,
    L3PreferenceService,
    {
      provide: WINDOW_BUILDER,
      inject: [CONVERSATION_MESSAGE_REPOSITORY],
      useFactory: (msgRepo: ConversationMessageRepository) => new WindowBuilder(msgRepo),
    },
    // AiClient: disabled adapter — throws on invocation until Phase-4 wires the real client.
    {
      provide: SUMMARIZER,
      inject: [PgBossService, CONVERSATION_REPOSITORY, CONVERSATION_MESSAGE_REPOSITORY],
      useFactory: (
        pgBoss: PgBossService,
        convRepo: ConversationRepository,
        msgRepo: ConversationMessageRepository,
      ) => new Summarizer(pgBoss, new DisabledSummarizerAiClient(), convRepo, msgRepo),
    },
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
    KernelTenantLister,
    {
      provide: CONVERSATION_RETENTION_SCHEDULER,
      inject: [PgBossService, CONVERSATION_REPOSITORY, KernelTenantLister],
      useFactory: (
        pgBoss: PgBossService,
        convRepo: ConversationRepository,
        tenantLister: KernelTenantLister,
      ) => new ConversationRetentionScheduler(pgBoss, convRepo, tenantLister),
    },
    CompositionMonitorWorker,
    ObservabilityContextFactory,
    FlowIdPropagation,
    TurnSamplingDecisionRecorder,
    LeakCanaryScheduler,
    ToolInvocationAuditRecorder,
    PricingResolver,
    OpenAiUsageExtractor,
    CostRecorder,
    BudgetChecker,
    RateLimiter,
    QualityCanarySubscription,
    ApprovalInboxThrottle,
    AdminBudgetOps,
    { provide: DRAFT_REPOSITORY, useClass: DrizzleDraftRepository },
    ApprovalExecutorDelegationMinter,
    DraftTierClassifier,
    FlowPolicyResolver,
    DraftSink,
    DraftProposer,
    ExecuteApprovedDraftWorker,
    DraftExpirySweeper,
    { provide: WRITE_DEDUP_REPOSITORY, useClass: DrizzleWriteDedupRepository },
    SweepExpiredWriteDedupWorker,
    {
      provide: DraftApprovalService,
      inject: [DRAFT_REPOSITORY, KernelAuditFacade, NotificationsWriteFacade, PgBossService],
      useFactory: (
        draftRepo: IDraftRepository,
        kernelAudit: KernelAuditFacade,
        notificationsWrite: NotificationsWriteFacade,
        pgBoss: PgBossService,
      ) =>
        new DraftApprovalService(draftRepo, kernelAudit, notificationsWrite, async (name, data) => {
          await pgBoss.enqueue(name, data as Record<string, unknown>)
        }),
    },
    { provide: SCHEDULE_REPOSITORY, useClass: DrizzleScheduleRepository },
    { provide: SCHEDULE_RUN_REPOSITORY, useClass: DrizzleScheduleRunRepository },
    ScheduleRepository,
    DelegationLifecycle,
    SchedulerPrincipal,
    TaintSeedDetector,
    ScheduledTurnSpawner,
    ScheduledTurnService,
    AgentEventRouter,
    ScheduledTurnWorker,
    DelegationExpirySweeper,
    SemanticResultCache,
    SemanticCacheSweeper,
    ActiveTurnRegistry,
    RequestContextDiscipline,
    CrossPodCancelService,
    // JwtService (custom, common/auth) — forward from global JWT_SERVICE token
    {
      provide: JwtService,
      useExisting: JWT_SERVICE,
    },
    { provide: GOLDEN_TRACE_REPOSITORY, useClass: DrizzleGoldenTraceRepository },
    { provide: CANARY_RUN_REPOSITORY, useClass: DrizzleCanaryRunRepository },
    { provide: CANARY_QUERY_REPOSITORY, useClass: DrizzleCanaryQueryRepository },
    { provide: SCORER_REGISTRATION_REPOSITORY, useClass: DrizzleScorerRegistrationRepository },
    ScorerRegistry,
    { provide: SCORER_REGISTRY, useExisting: ScorerRegistry },
    ReplayHarness,
    { provide: REPLAY_HARNESS, useExisting: ReplayHarness },
    GoldenTraceRunner,
    { provide: GOLDEN_TRACE_RUNNER, useExisting: GoldenTraceRunner },
    QualityCanaryScheduler,
    { provide: QUALITY_CANARY_SCHEDULER, useExisting: QualityCanaryScheduler },
    CanaryQueryRotator,
    { provide: CANARY_QUERY_ROTATOR, useExisting: CanaryQueryRotator },
    DegradedTierFallback,
    { provide: DEGRADED_TIER_FALLBACK, useExisting: DegradedTierFallback },
    ConfidenceCalibrationService,
    { provide: CONFIDENCE_CALIBRATION_SERVICE, useExisting: ConfidenceCalibrationService },
    { provide: TOOL_REGISTRY_TOKEN, useExisting: ToolRegistry },
    IntentDriftScorer,
    { provide: INTENT_DRIFT_SCORER, useExisting: IntentDriftScorer },
    RolloutResolver,
    ShadowDiffScorer,
    ShadowExecutor,
    ShadowTurnWorker,
    RegressionSignalMonitor,
    AutoRollbackOrchestrator,
    { provide: AGENT_ITERATION_REPOSITORY, useClass: DrizzleAgentIterationRepository },
    IterationCeilingEnforcer,
    CompletionScorerRunner,
    IterativeRePlanner,
    // SubAgentRunnerAdapter — resolves ValidatedSubAgentConfig from SubAgentRegistry
    // and forwards to the sub-agent execution pipeline (full ReAct loop deferred to
    // phase-executor integration layer). Throws on unknown sub_agent_key — never silent.
    SubAgentRunnerAdapter,
    { provide: I_SUB_AGENT_RUNNER, useExisting: SubAgentRunnerAdapter },
    // SynthesizerAdapter — merges iteration outputs into a SynthesizerOutput using
    // the pure deterministic synthesis functions. Full LLM-synthesis path deferred to
    // the phase-executor integration layer.
    SynthesizerAdapter,
    { provide: I_SYNTHESIZER, useExisting: SynthesizerAdapter },
    IterativeOrchestrator,
    { provide: ITERATIVE_ORCHESTRATOR, useExisting: IterativeOrchestrator },
    { provide: READINESS_CHECK_REPOSITORY, useClass: DrizzleReadinessCheckRepository },
    { provide: GA_READINESS_STATE_REPOSITORY, useClass: DrizzleGaReadinessStateRepository },
    { provide: RUNBOOK_DRY_RUN_REPOSITORY, useClass: DrizzleRunbookDryRunRepository },
    { provide: P1_INCIDENT_REPOSITORY, useClass: DrizzleP1IncidentRepository },
    { provide: COST_RECONCILIATION_REPOSITORY, useClass: DrizzleCostReconciliationRepository },
    // Ports — stub implementations for MVP (replaced by real adapters post-MVP)
    { provide: METRICS_QUERY_PORT, useClass: StubMetricsQuery },
    { provide: CI_STATE_PORT, useClass: StubCiState },
    { provide: GA_METRICS_PORT, useClass: StubGaMetrics },
    ReliabilityTurnCompletedRateEvaluator,
    ReliabilityUncaughtErrorRateEvaluator,
    ReliabilityProviderFallbackRateEvaluator,
    ReliabilitySingleAbortPathEvaluator,
    ReliabilityDraftsDiscardedOnAbortEvaluator,
    SecurityCrossTenantLeakSuiteEvaluator,
    SecurityRlsUnbypassableEvaluator,
    SecurityIdentityKeyWriteDisciplineEvaluator,
    SecurityTaintPropagatesApprovalEvaluator,
    SecurityKernelAuditPerToolCallEvaluator,
    CostPerTurnVarianceEvaluator,
    CostCacheHitRateEvaluator,
    CostBudgetRefusalPrecisionEvaluator,
    CostAdapterDroppedCacheFieldsEvaluator,
    CostTierShiftUserNoticeRateEvaluator,
    ObservabilityTraceCorrelationEvaluator,
    ObservabilitySamplingTriggerCoverageEvaluator,
    ObservabilityCanaryDetectsDegradationEvaluator,
    ObservabilityPiiRedactionEvaluator,
    ObservabilityReplayCoverageEvaluator,
    RolloutGoldenTraceCiGateEvaluator,
    RolloutCanaryStagesEvaluator,
    RolloutShadowModeExercisedEvaluator,
    RolloutVersionPinningComplianceEvaluator,
    RolloutIntentSlugCoverageEvaluator,
    // CRITERION_EVALUATORS multi-provider — assembled from the 25 evaluator classes.
    // ReadinessValidator injects this token to receive the full ordered list.
    {
      provide: CRITERION_EVALUATORS,
      useFactory: (
        e1: ReliabilityTurnCompletedRateEvaluator,
        e2: ReliabilityUncaughtErrorRateEvaluator,
        e3: ReliabilityProviderFallbackRateEvaluator,
        e4: ReliabilitySingleAbortPathEvaluator,
        e5: ReliabilityDraftsDiscardedOnAbortEvaluator,
        e6: SecurityCrossTenantLeakSuiteEvaluator,
        e7: SecurityRlsUnbypassableEvaluator,
        e8: SecurityIdentityKeyWriteDisciplineEvaluator,
        e9: SecurityTaintPropagatesApprovalEvaluator,
        e10: SecurityKernelAuditPerToolCallEvaluator,
        e11: CostPerTurnVarianceEvaluator,
        e12: CostCacheHitRateEvaluator,
        e13: CostBudgetRefusalPrecisionEvaluator,
        e14: CostAdapterDroppedCacheFieldsEvaluator,
        e15: CostTierShiftUserNoticeRateEvaluator,
        e16: ObservabilityTraceCorrelationEvaluator,
        e17: ObservabilitySamplingTriggerCoverageEvaluator,
        e18: ObservabilityCanaryDetectsDegradationEvaluator,
        e19: ObservabilityPiiRedactionEvaluator,
        e20: ObservabilityReplayCoverageEvaluator,
        e21: RolloutGoldenTraceCiGateEvaluator,
        e22: RolloutCanaryStagesEvaluator,
        e23: RolloutShadowModeExercisedEvaluator,
        e24: RolloutVersionPinningComplianceEvaluator,
        e25: RolloutIntentSlugCoverageEvaluator,
      ) => [
        e1,
        e2,
        e3,
        e4,
        e5,
        e6,
        e7,
        e8,
        e9,
        e10,
        e11,
        e12,
        e13,
        e14,
        e15,
        e16,
        e17,
        e18,
        e19,
        e20,
        e21,
        e22,
        e23,
        e24,
        e25,
      ],
      inject: [
        ReliabilityTurnCompletedRateEvaluator,
        ReliabilityUncaughtErrorRateEvaluator,
        ReliabilityProviderFallbackRateEvaluator,
        ReliabilitySingleAbortPathEvaluator,
        ReliabilityDraftsDiscardedOnAbortEvaluator,
        SecurityCrossTenantLeakSuiteEvaluator,
        SecurityRlsUnbypassableEvaluator,
        SecurityIdentityKeyWriteDisciplineEvaluator,
        SecurityTaintPropagatesApprovalEvaluator,
        SecurityKernelAuditPerToolCallEvaluator,
        CostPerTurnVarianceEvaluator,
        CostCacheHitRateEvaluator,
        CostBudgetRefusalPrecisionEvaluator,
        CostAdapterDroppedCacheFieldsEvaluator,
        CostTierShiftUserNoticeRateEvaluator,
        ObservabilityTraceCorrelationEvaluator,
        ObservabilitySamplingTriggerCoverageEvaluator,
        ObservabilityCanaryDetectsDegradationEvaluator,
        ObservabilityPiiRedactionEvaluator,
        ObservabilityReplayCoverageEvaluator,
        RolloutGoldenTraceCiGateEvaluator,
        RolloutCanaryStagesEvaluator,
        RolloutShadowModeExercisedEvaluator,
        RolloutVersionPinningComplianceEvaluator,
        RolloutIntentSlugCoverageEvaluator,
      ],
    },
    ReadinessValidator,
    GaReadinessComputer,
    RunbookDryRunScheduler,
    CostReconciliationJob,
    QuarterlyRedTeamDrill,
    ScaleProbeRunner,
    ExtensibilityInvariantAudit,
    FlowCorrelationProbe,
    // Workers — registered in onApplicationBootstrap
    ReadinessHourlyWorker,
    CostReconciliationWorker,
    FlowCorrelationWorker,
  ],
  exports: [
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
    private readonly draftApprovalService: DraftApprovalService,
    @Inject(DRAFT_REPOSITORY) private readonly draftRepo: IDraftRepository,
    private readonly scheduleRepository: ScheduleRepository,
    private readonly delegationLifecycle: DelegationLifecycle,
    private readonly kernelDelegationFacade: KernelDelegationFacade,
    private readonly scheduledTurnWorker: ScheduledTurnWorker,
    private readonly delegationExpirySweeper: DelegationExpirySweeper,
    @Inject(SCHEDULE_RUN_REPOSITORY)
    private readonly scheduleRunRepository: IScheduleRunRepository,
    private readonly scorerRegistry: ScorerRegistry,
    private readonly intentDriftScorer: IntentDriftScorer,
    private readonly qualityCanaryScheduler: QualityCanaryScheduler,
    private readonly shadowTurnWorker: ShadowTurnWorker,
    @Inject(DB_TOKEN) private readonly db: Db,
    private readonly kernelAuditFacade: KernelAuditFacade,
    private readonly autoRollbackOrchestrator: AutoRollbackOrchestrator,
    private readonly readinessHourlyWorker: ReadinessHourlyWorker,
    private readonly costReconciliationWorker: CostReconciliationWorker,
    private readonly flowCorrelationWorker: FlowCorrelationWorker,
    private readonly runbookScheduler: RunbookDryRunScheduler,
    @Inject(GA_READINESS_STATE_REPOSITORY)
    private readonly gaReadinessStateRepo: GaReadinessStateRepository,
    @Inject(READINESS_CHECK_REPOSITORY)
    private readonly readinessCheckRepo: ReadinessCheckRepository,
    private readonly semanticCacheSweeper: SemanticCacheSweeper,
    private readonly sweepExpiredWriteDedupWorker: SweepExpiredWriteDedupWorker,
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
    setDraftApprovalService(this.draftApprovalService)
    setScheduleHandlers({
      scheduleRepository: this.scheduleRepository,
      delegationLifecycle: this.delegationLifecycle,
      scheduleRunRepository: this.scheduleRunRepository,
    })
    setRolloutHandlers({
      db: this.db,
      kernelAuditFacade: this.kernelAuditFacade,
      autoRollbackOrchestrator: this.autoRollbackOrchestrator,
    })
    setReadinessHandlers({
      gaReadinessStateRepo: this.gaReadinessStateRepo,
      readinessCheckRepo: this.readinessCheckRepo,
      runbookScheduler: this.runbookScheduler,
    })

    // TrpcModule.onModuleInit() must have run before AgentsModule.onModuleInit()
    // to ensure permission-enforcing routers have been swapped in.
    // NestJS module init order is determined by import order in AppModule;
    // TrpcModule is imported before AgentsModule in app.module.ts.
    this.toolRegistry.loadFromRouter(getAppRouter())

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

    const allTools = this.toolRegistry.listAgentTools()
    await this.toolDescriptorEmbedder.ensureEmbedded(allTools)
    await this.toolDescriptorEmbedder.buildInMemoryIndex(allTools)

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
    // Summarizer worker fires post-turn to generate async summaries.
    // SUMMARIZER token is a Symbol so we use the injected instance directly.
    await this.summarizer.registerWorkers()

    // Daily cron to archive idle conversations.
    await this.retentionScheduler.registerWorkers()

    // Best-effort, post-turn async job — never blocks tool calls (Tenet #9).
    await this.pgBossService.registerWorker<CompositionMonitorJobData>(
      'observability-composition-monitor',
      async (jobs) => {
        for (const job of jobs) {
          await this.compositionMonitorWorker.handle(job)
        }
      },
    )

    // Daily 3am UTC scan for cross-tenant trace leaks — MVP stub records 'clean'.
    await this.leakCanaryScheduler.registerJob()

    // Processes approved drafts enqueued by DraftProposer after approval.
    await this.pgBossService.registerWorker<Parameters<ExecuteApprovedDraftWorker['handle']>[0]>(
      'agents.execute-approved-draft',
      async (jobs) => {
        for (const job of jobs) {
          await this.executeApprovedDraftWorker.handle(job.data)
        }
      },
    )

    // Runs every 15 minutes to mark pending-expired drafts as 'expired'.
    await this.draftExpirySweeper.registerJob(this.pgBossService)

    // Processes agent.scheduled-turn jobs enqueued by ScheduledTurnSpawner.
    await this.pgBossService.registerWorker<ScheduledTurnJob>(
      SCHEDULED_TURN_QUEUE,
      async (jobs) => {
        for (const job of jobs) {
          await this.scheduledTurnWorker.handle(job.data)
        }
      },
    )

    // Runs daily at 01:00 UTC to expire stale delegations.
    await this.delegationExpirySweeper.registerJob(this.pgBossService)

    await this.scorerRegistry.register(this.intentDriftScorer)

    await this.pgBossService.schedule('agent.quality-canary-tick', '0 * * * *')
    this.pgBossService.registerWorker('agent.quality-canary-tick', async (_jobs) => {
      await this.qualityCanaryScheduler.tickHourly()
    })

    await this.readinessHourlyWorker.registerWorker()

    await this.costReconciliationWorker.registerWorker()

    await this.flowCorrelationWorker.registerWorker()

    // 5-minute sweep of expired cache rows.
    await this.semanticCacheSweeper.registerJob(this.pgBossService)

    await this.sweepExpiredWriteDedupWorker.registerJob(this.pgBossService)
  }
}
