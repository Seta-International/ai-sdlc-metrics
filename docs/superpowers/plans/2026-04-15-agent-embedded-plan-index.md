# Embedded Agent Package — Plan Index

**Spec:** `docs/superpowers/specs/2026-04-15-agent-embedded-design.md`

**Goal:** Restructure agents from standalone zone to shared `@future/agent` package embedded across all zones with three surfaces: conversational panel, inline contextual actions, and ambient insights.

## Plan Sequence

| #   | Plan                                                                        | Depends On | Summary                                                                               |
| --- | --------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------- |
| 01  | [Package Foundation](2026-04-15-agent-01-package-foundation.md)             | —          | Create `packages/agent/` with types, AgentProvider, AgentContextProvider, hooks       |
| 02  | [Backend Routes](2026-04-15-agent-02-backend.md)                            | 01         | tRPC routes for sessions, messages, insights, config. SSE subscriptions for streaming |
| 03  | [Agent Panel Surface](2026-04-15-agent-03-panel.md)                         | 01, 02     | AgentPanel, AgentMessage, AgentToolTrace, AgentContextPills, useAgentSession          |
| 04  | [Inline & Ambient Surfaces](2026-04-15-agent-04-inline-ambient.md)          | 01, 02     | AgentInlineAction, AgentInlineResponse, AgentStrip, AgentBadge, AgentBanner           |
| 05  | [Layout & GlobalNav Integration](2026-04-15-agent-05-layout-integration.md) | 01, 03, 04 | Wire agent panel + strip into app-layout and GlobalNav                                |
| 06  | [Zone Rollout & Cleanup](2026-04-15-agent-06-zone-rollout.md)               | 05         | Integrate all 11 zones, delete web-agents, add agent config to web-admin              |
