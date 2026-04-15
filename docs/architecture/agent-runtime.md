# Future — Agent Runtime Design

**Date:** 2026-04-08  
**Status:** Agreed  
**Project:** Seta Future AaaS

---

## Purpose

This document captures the agreed agent runtime architecture for Future. The design draws from three reference points:

- **OpenClaw / GoClaw** — Gateway pattern: single control plane for sessions, routing, MCP tool registry, channel abstraction
- **Salesforce Agentforce** — Topics / Actions / Guardrails model, tenant-configurable Agent Builder
- **MISA Agentic Enterprise** — domain agents as self-operating business functions; humans handle exceptions

The result is an enterprise-grade, multi-tenant agent platform where each tenant configures their own agents without writing code, backed by the kernel's governance primitives on every action.

---

## Core Principles

- **Gateway as single control plane** — all agent interactions (web chat, event triggers, future channels) flow through the Agent Gateway. Session management, routing, and MCP tool registry live here.
- **Channel abstraction** — agent logic is channel-agnostic. Adding Zalo, Slack, or Teams later = one new channel adapter. Zero changes to gateway or domain logic.
- **Topics as intent classification** — user intent is classified into a Topic, each with its own instructions and allowed actions.
- **Actions as registered catalog** — every domain capability is a registered Action via MCP. Topics declare which actions they may execute.
- **Guardrails as first-class** — tenant-defined rules + platform-managed safety, enforced at every step of the reasoning loop.
- **Kernel governance on every action** — every action is checked against `exposure_contract` + `role_grant`. Every executed action writes an `audit_event`. No agent action is untracked.
- **No phases** — full agent platform operational from day one.

---

## Agent Platform Layers

```
┌───────────────────────────────────────────────────────┐
│  Agent Builder  (apps/web-admin → /agents)             │
│  No-code UI: agents, topics, actions, guardrails       │
└───────────────────────────────────────────────────────┘
          ↓
┌───────────────────────────────────────────────────────┐
│  Channel Layer  (transport abstraction)                │
│  ├── WebSocketChannel   → embedded panel (@future/agent) │
│  ├── TeamsChannel       → Microsoft Teams Bot          │
│  ├── SlackChannel       → Slack workspace bot          │
│  ├── EventChannel       → event-triggered agents       │
│  └── [ZaloChannel]      → future adapter               │
└───────────────────────────────────────────────────────┘
          ↓
┌───────────────────────────────────────────────────────┐
│  Agent Gateway  (NestJS — OpenClaw/GoClaw pattern)     │
│  AgentGateway → SessionManager → TopicRouter           │
│  McpToolRegistry → guardrail enforcement               │
└───────────────────────────────────────────────────────┘
          ↓
┌───────────────────────────────────────────────────────┐
│  Reasoning Loop  (Vercel AI SDK 6)                     │
│  GPT-5.4-nano (classify) + GPT-5.4 (reasoning)         │
│  @ai-sdk/openai → OpenAI API                           │
└───────────────────────────────────────────────────────┘
          ↓
┌───────────────────────────────────────────────────────┐
│  MCP Tool Registry  (per-module MCP servers)           │
│  people-mcp / time-mcp / finance-mcp / ...             │
│  @rekog/mcp-nest decorators, HTTP+SSE transport        │
└───────────────────────────────────────────────────────┘
          ↓
┌───────────────────────────────────────────────────────┐
│  Kernel Governance  (always-on)                        │
│  exposure_contract + role_grant + audit_event          │
└───────────────────────────────────────────────────────┘
```

---

## Agents Module — Internal Structure (DDD)

```
modules/agents/
  domain/
    entities/
      agent-definition.entity.ts
      agent-topic.entity.ts
      agent-session.entity.ts       ← stateful session (not request-scoped)
      agent-message.entity.ts
    value-objects/
      topic-key.vo.ts
      guardrail-config.vo.ts
    events/                         ← internal events only
    repositories/                   ← port interfaces
  application/
    gateway/                        ← Agent Gateway (OpenClaw/GoClaw pattern)
      agent-gateway.service.ts      ← single entry point for all interactions
      session-manager.service.ts    ← session lifecycle, history, concurrency
      topic-router.service.ts       ← classify message → matched topic
      mcp-tool-registry.service.ts  ← discovers + registers tools from all modules
    commands/
      start-conversation.command.ts
      send-message.command.ts
      trigger-event-agent.command.ts
    event-handlers/                 ← listens to cross-module events (event-triggered agents)
      on-person-hired.handler.ts
      on-leave-approved.handler.ts
    facades/
      agents-query.facade.ts        ← exposed to other modules
  infrastructure/
    channels/                       ← channel abstraction (OpenClaw pattern)
      websocket.channel.ts          ← web chat: NestJS @WebSocketGateway
      teams.channel.ts              ← Microsoft Teams: botbuilder SDK, POST /api/messages
      slack.channel.ts              ← Slack: nest-slack-bolt, OAuth per workspace
      event.channel.ts              ← event-triggered agent entry point
      zalo.channel.ts               ← future: one adapter class
    repositories/
      drizzle-agent.repository.ts
    schema/
      agents.schema.ts
  interface/
    trpc/
      agents.router.ts              ← zone panels connect via tRPC (non-streaming)
    ws/
      agents.gateway.ts             ← WebSocket streaming (NestJS @WebSocketGateway)
  agents.module.ts
```

---

## Agent Gateway — Core Flow

```
Message arrives (WebSocket from embedded AgentPanel in any zone)
  → AgentGateway.handle(message, channelContext)
      1. SessionManager.getOrCreate(tenantId, actorId, agentId)
         → load session history from agents.agent_session
      2. TopicRouter.classify(message, agent.topics)
         → Vercel AI SDK generateText, Claude Haiku
         → returns matched topic + confidence
         → ON FAILURE: jump to ERROR HANDLER
      3. Load: topic instructions + allowed actions + guardrails
      4. Ground context:
         → pgvector semantic search: relevant policy docs / past decisions
         → KernelQueryFacade: actor org placement, role grants
      5. McpToolRegistry.getTools(topic.allowedActions)
         → filtered by exposure_contract for this actor
      6. Reasoning loop (Vercel AI SDK streamText, Claude Sonnet):
         → tool calls → guardrail check → kernel auth check → MCP execute
         → audit_event written per action (inside loop, before streaming)
         → stopWhen: task complete or max 10 tool calls
         → ON MID-STREAM FAILURE: jump to ERROR HANDLER with partial=true
      7. Stream response → WebSocket → embedded AgentPanel
      8. SessionManager.append(message, response)
         → write agent_message with role=assistant, content=full response
      9. If session ends: summarise → pgvector (long-term memory)

  ERROR HANDLER (called from any step):
      → send structured error message to client:
        { error: true, code: 'CLASSIFICATION_FAILED'|'REASONING_FAILED'|'TOOL_ERROR',
          message: "I'm having trouble processing that. Please try again." }
      → write agent_message with role=assistant, content=error message, error=true
      → update agent_session.status = 'error'
      → write audit_event with event_type=agent.error, payload includes error details
      → close WebSocket stream gracefully
```

**Error handling contract:**

| Failure point                                     | User experience                                          | Audit trail                                        |
| ------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------- |
| Step 2: Haiku API down                            | "I'm having trouble. Try again."                         | audit_event: agent.classification_failed           |
| Step 6: Sonnet timeout (before streaming started) | "I'm having trouble. Try again."                         | audit_event: agent.reasoning_failed                |
| Step 6: Sonnet failure mid-stream                 | Partial text shown, then error message appended          | audit_event: agent.reasoning_partial, partial=true |
| Step 5: exposure_contract check fails             | "You don't have permission to do that."                  | audit_event: agent.permission_denied               |
| Any MCP tool failure                              | Tool error surfaced in response, loop continues or stops | audit_event: agent.tool_error                      |

**Rule:** ALL agent session closures — success, error, escalation, or expiry — MUST write a final `agent_message` record and update `agent_session.status`. No orphaned sessions without a terminal message.

---

## Agent Config Schema

```sql
-- UUID v7 on all IDs

agents.agent_definition
  id            UUID v7 PRIMARY KEY
  tenant_id
  actor_id      → kernel.actor (type: system) — agent has an auditable identity
  name          TEXT
  description   TEXT
  status        active | draft | disabled
  created_at, updated_at

agents.agent_topic
  id            UUID v7 PRIMARY KEY
  tenant_id
  agent_id      → agent_definition
  topic_key     TEXT  (leave-management | org-lookup | policy-qa | ...)
  instructions  TEXT  (system prompt fragment for this topic)
  priority      INT   (disambiguation when multiple topics match)

agents.agent_action
  id            UUID v7 PRIMARY KEY
  tenant_id
  topic_id      → agent_topic
  action_type   mcp_tool | decision_trigger | notification | data_query
  mcp_server    people | time | hiring | finance | performance | goals | kernel
  tool_name     TEXT  (e.g. time_get_leave_balance)
  is_enabled    BOOLEAN

agents.agent_guardrail
  id            UUID v7 PRIMARY KEY
  tenant_id
  agent_id      → agent_definition
  guardrail_type  topic_restriction | data_restriction | escalation_rule |
                  pii_redact | max_tool_calls | confidence_threshold
  config        JSONB
  is_active     BOOLEAN

agents.agent_session
  id            UUID v7 PRIMARY KEY
  tenant_id
  actor_id      → kernel.actor
  agent_id      → agent_definition
  channel_type  web_chat | teams | slack | event_trigger
  status        active | completed | escalated | expired | error
  created_at, ended_at

agents.agent_message
  id            UUID v7 PRIMARY KEY
  session_id    → agent_session
  tenant_id
  role          user | assistant | tool_call | tool_result
  content       TEXT
  model_used    TEXT
  tokens_used   INT
  error         BOOLEAN DEFAULT false
  created_at
```

---

## MCP Tool Registry — In-Process HTTP Overhead Note

The per-module MCP servers run inside the NestJS monolith at `/mcp/{module}`. Tool calls from the Agent Gateway reach module MCP servers via loopback HTTP (same process, port 3000 → /mcp/time → NestJS request pipeline). This is full MCP protocol compliance and enables future external MCP client connections to module tools.

**Performance implication:** each tool call in a reasoning loop adds a loopback HTTP round-trip (~5-15ms at localhost). For a 10-tool-call session, this is 50-150ms of overhead beyond the LLM latency.

**Benchmark requirement:** during the first agent iteration, benchmark loopback MCP vs. direct NestJS service injection for 5 and 10 tool call chains. If loopback overhead exceeds 20ms per call (i.e., >200ms for a 10-call chain), consider a hybrid approach: in-process direct calls for read-only tools, loopback HTTP only for action tools that need the MCP protocol guarantees (schema validation, sampling controls). The tool registry interface does not change — only the transport behind it.

## MCP Tool Registry — Per-Module Servers

Each domain module exposes its own MCP server using `@rekog/mcp-nest`. Transport: HTTP+SSE at `/mcp/{module}`.

**Tool naming convention:** `{module}_{action}` — prevents collisions across modules.

```ts
// modules/time/interface/mcp/time-mcp.service.ts
@Injectable()
export class TimeMcpService {
  @Tool({ name: 'time_get_leave_balance' })
  async getLeaveBalance(@Context() ctx, @Input() input: GetLeaveBalanceInput) {
    return this.timeQueryFacade.getLeaveBalance(input.actorId, ctx.tenantId)
  }

  @Tool({ name: 'time_submit_leave_request' })
  async submitLeaveRequest(@Context() ctx, @Input() input: SubmitLeaveInput) {
    return this.commandBus.execute(new SubmitLeaveRequestCommand(...))
  }
}
```

**Full tool catalog:**

```
people-mcp:     people_get_actor, people_get_org_chart, people_list_employees
time-mcp:       time_get_leave_balance, time_submit_leave_request, time_get_attendance
hiring-mcp:     hiring_list_candidates, hiring_shortlist, hiring_schedule_interview
performance-mcp: performance_get_review_cycle, performance_submit_evaluation
projects-mcp:   projects_get_roster, projects_get_health
goals-mcp:      goals_get_okrs, goals_get_kpi_score
finance-mcp:    finance_get_invoice_status, finance_get_payroll_summary
decision-mcp:   decision_get_pending, decision_approve, decision_reject, decision_escalate
insights-mcp:   insights_get_headcount, insights_get_attrition_trend
```

---

## Event-Triggered Agents

Agents react to domain events without a user initiating a conversation.

```
packages/event-contracts → PersonHiredEvent fires
  → EventBus.publish() (in-process)
  → agents/application/event-handlers/on-person-hired.handler.ts
      → check: does any active agent_definition handle this event for this tenant?
      → create agent_session (channel_type: event_trigger)
      → AgentGateway.handleEvent(event, agentDefinition)
          → Claude Haiku for simple notifications
          → Claude Sonnet for multi-step reactions
          → actions: notification | decision_trigger | data_mutation
      → write agent_session + agent_message (full audit trail)
```

**Max tool calls for event agents:** 3 — prevents runaway chains.

**Escalation:** if guardrail fires → `decision_case` created in kernel → human picks up.

---

## Guardrails

Two tiers:

**Platform-managed (Future enforces, tenants cannot override):**

- Agents only access data within their tenant boundary (RLS + exposure_contract)
- No action executes without a valid `exposure_contract`
- All actions produce `audit_event` records — always
- Max 10 tool calls per conversational session turn
- Max 3 tool calls per event-triggered run

**Tenant-defined (configurable via Agent Builder):**

- Topic restriction: agent only handles declared topics
- Data restriction: "never surface salary data in responses"
- Escalation rule: "always escalate termination requests to HR Ops"
- Confidence threshold: "ask for clarification if confidence < 0.7"
- PII redaction: mask employee IDs / personal data in responses

---

## LLM Configuration

| Use case                            | Model          | Why                                                    |
| ----------------------------------- | -------------- | ------------------------------------------------------ |
| Topic classification                | `gpt-5.4-nano` | Fast (<200ms), lowest cost, single classification call |
| Multi-step reasoning + tool calls   | `gpt-5.4`      | Best reasoning quality, native parallel tool calls     |
| Simple notifications (event agents) | `gpt-5.4-nano` | No complex reasoning needed                            |

```ts
import { openai } from '@ai-sdk/openai'
// OPENAI_API_KEY resolved at runtime via AdminQueryFacade.getResolvedAiConfig()
// Tenant BYO key takes precedence over platform default

const classifyModel = openai(resolvedConfig.classificationModel) // default: 'gpt-5.4-nano'
const reasoningModel = openai(resolvedConfig.reasoningModel) // default: 'gpt-5.4'
```

Model selection is per-topic and per-tenant — configurable in Agent Builder and overridable by tenant admin in `web-admin`.

**Azure OpenAI fallback:** swap `@ai-sdk/openai` → `@ai-sdk/azure` with a Southeast Asia deployment. Provider factory swap only — no business logic changes.

**Parallel tool calls:** OpenAI executes multiple tool calls concurrently by default. All MCP tool handlers MUST be safe for concurrent execution — stateless or with proper row-level locking. This is a hard rule: never assume sequential tool execution.

---

## Observability — Langfuse (Self-Hosted)

Langfuse runs on ECS Fargate with its own RDS instance (separate from OLTP — trace write volume would impact OLTP performance).

```ts
import { Langfuse } from 'langfuse'

const langfuse = new Langfuse({
  publicKey: process.env.LANGFUSE_PUBLIC_KEY, // from Secrets Manager
  secretKey: process.env.LANGFUSE_SECRET_KEY,
  baseUrl: process.env.LANGFUSE_BASE_URL, // internal ECS service URL
})

const trace = langfuse.trace({
  name: 'agent-execution',
  userId: actorId,
  metadata: { tenantId, agentId, sessionId },
})
```

Collects per run: model, tokens, latency, tool calls, guardrail hits, errors — grouped by tenant + agent. Enables token cost attribution per tenant.

---

## Microsoft Teams Channel

**Architecture:**

```
Teams user sends message
  → Azure Bot Service (single-tenant registration, SETA's Azure AD)
  → POST /api/messages → NestJS TeamsChannel adapter
      1. Verify Bot Framework auth (HMAC signature)
      2. Map Teams tenant ID → Future tenant_id
         via external_identity_map (system_name: microsoft_teams)
      3. Map Teams user AAD OID → Future actor_id
         via external_identity_map (system_name: microsoft)
      4. Route to AgentGateway.handle(message, channelContext)
      5. Stream response back via Bot Framework streaming UX
         (Informative Activity Updates — token-by-token)
```

**Deployment model:**

- Single Azure Bot Service registration in SETA's Azure tenant
- Distributed to customer tenants via Teams Admin Center (admin-approved sideload)
- Each customer IT admin installs once — all their users can chat with the bot
- Multi-tenant bot deprecation (July 2025): resolved by single-tenant registration + AppSource distribution

**Teams tenant onboarding:**

```sql
-- When a customer installs the Teams bot, store their Azure tenant ID
INSERT INTO external_identity_map (actor_id, system_name, external_id)
VALUES ($future_tenant_actor_id, 'microsoft_teams', $azure_tenant_id)
```

**Streaming in Teams:** uses Teams Streaming UX (Informative Activity Updates). Compatible with Vercel AI SDK `streamText` — chunks forwarded as typing indicators until final response.

---

## Slack Channel

**Architecture:**

```
Slack user sends message to @FutureBot
  → Slack Events API → POST /slack/events → NestJS SlackChannel adapter
      (nest-slack-bolt, HMAC signature verified)
      1. Map Slack workspace ID → Future tenant_id
         via external_identity_map (system_name: slack)
      2. Map Slack user ID → Future actor_id
         via external_identity_map (system_name: slack)
      3. Route to AgentGateway.handle(message, channelContext)
      4. Stream response via progressive chat.update()
         (Slack doesn't support true token streaming —
          send initial "thinking..." message, update as chunks arrive)
```

**Multi-workspace OAuth installation:**

- Each Future customer installs the Slack app in their workspace via OAuth
- Installation stores `bot_token` + `workspace_id` in `agents.slack_installation`
- `authorize` function in `nest-slack-bolt` looks up token by workspace ID per request

```sql
agents.slack_installation
  id                UUID v7 PRIMARY KEY
  tenant_id         → Future tenant
  workspace_id      TEXT   (Slack workspace/team ID)
  bot_token_ref     TEXT   (AWS Secrets Manager secret ARN — token never stored in DB)
  installed_at      TIMESTAMPTZ

-- NOTE: bot_token is stored in AWS Secrets Manager only.
-- bot_token_ref holds the secret ARN. At runtime, the channel adapter retrieves
-- the token via a process-level cache (see below). This table is EXCLUDED from
-- the Glue ETL lakehouse pipeline.
```

**Bot token retrieval — process-level cache required:**

Secrets Manager has ~40ms round-trip latency from ap-southeast-1. Calling it per message adds fixed overhead to every agent interaction and risks hitting per-account throttle limits at Milestone 2 scale.

```ts
// infrastructure/channels/token-cache.service.ts
@Injectable()
export class ChannelTokenCacheService {
  private readonly cache = new Map<string, { token: string; expiresAt: number }>()
  private readonly TTL_MS = 5 * 60 * 1000 // 5 minutes

  async getBotToken(secretArn: string): Promise<string> {
    const cached = this.cache.get(secretArn)
    if (cached && cached.expiresAt > Date.now()) {
      return cached.token
    }
    // Cache miss or TTL expired — fetch from Secrets Manager
    const secret = await this.secretsManager.getSecretValue({ SecretId: secretArn })
    const token = JSON.parse(secret.SecretString!).bot_token
    this.cache.set(secretArn, { token, expiresAt: Date.now() + this.TTL_MS })
    return token
  }
}
```

**Secret rotation:** AWS Secrets Manager rotation triggers a new secret version. The 5-minute TTL ensures the cache refreshes within that window. If a token is revoked immediately (workspace uninstall, OAuth revocation), the cache will serve the stale token for up to 5 minutes — acceptable for a Slack bot token; not acceptable for a user session token. Apply this cache pattern ONLY to bot tokens, not to user-facing auth tokens.

---

## Default Agents (Seeded at Tenant Provisioning)

| Agent               | Default Topics                                       | Channels                 | Mode           |
| ------------------- | ---------------------------------------------------- | ------------------------ | -------------- |
| HR Assistant        | Leave policy Q&A, leave requests, org lookups        | Web Chat + Teams + Slack | Conversational |
| Manager Assistant   | Team approvals, performance summaries, roster view   | Web Chat + Teams + Slack | Conversational |
| Hiring Assistant    | CV shortlist, interview scheduling, pipeline summary | Web Chat + Slack         | Conversational |
| Executive Assistant | KPI summary, org health, headcount trends            | Web Chat + Teams + Slack | Conversational |
| Onboarding Agent    | Checklist creation, day-1 briefing                   | Event: PersonHired       | Automation     |
| Offboarding Agent   | Clearance workflow, access revocation                | Event: PersonOffboarded  | Automation     |
| Staffing Agent      | Roster gap detection, assignment recommendations     | Event: project events    | Automation     |

---

## Decisions Log

| Decision                 | Outcome                                                                             |
| ------------------------ | ----------------------------------------------------------------------------------- |
| Gateway pattern          | Adopted from OpenClaw/GoClaw — implemented inside NestJS agents module              |
| Gateway deployment       | Not a separate service — lives inside NestJS monolith. Extract when needed.         |
| Channel abstraction      | Infrastructure adapters per channel — WebSocket (now), Slack/Zalo (future)          |
| Current channels         | Web chat (WebSocket) + Microsoft Teams + Slack + event triggers                     |
| Teams bot registration   | Single-tenant Azure Bot Service (SETA's Azure AD) + admin-approved sideload         |
| Teams tenant mapping     | `external_identity_map` system_name: `microsoft_teams` → Future tenant_id           |
| Slack integration        | `nest-slack-bolt`, OAuth per workspace, `agents.slack_installation` table           |
| Slack tenant mapping     | `external_identity_map` system_name: `slack` → Future tenant_id                     |
| Agent definition model   | Topics / Actions / Guardrails (Agentforce-style)                                    |
| MCP servers              | Per-module, `@rekog/mcp-nest`, HTTP+SSE at `/mcp/{module}`                          |
| Tool naming              | `{module}_{action}` convention                                                      |
| LLM provider             | OpenAI API (`@ai-sdk/openai`) — not Bedrock, not Anthropic                          |
| Classification model     | `gpt-5.4-nano` — configurable per tenant via `web-admin`                            |
| Reasoning model          | `gpt-5.4` — configurable per tenant via `web-admin`                                 |
| Parallel tool calls      | OpenAI executes tool calls concurrently — all MCP handlers must be concurrency-safe |
| AI config resolution     | `AdminQueryFacade.getResolvedAiConfig()` — tenant override → platform default       |
| Observability            | Langfuse self-hosted on ECS, separate RDS instance                                  |
| Session storage          | PostgreSQL `agents.agent_session` (auditable, not ephemeral Redis)                  |
| Event-triggered delivery | packages/event-contracts → EventBus → agent event-handlers                          |
| All IDs                  | UUID v7                                                                             |

---

## Next

Layer 5 — Deployment Infrastructure: AWS architecture, ECS Fargate topology, CI/CD, environments, IaC with Terraform.
