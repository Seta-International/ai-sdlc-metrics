# Router Pipeline — Alerting Dashboards (Plan 02 §8)

These queries are the alerting/dashboard spec — not authoritative config for a specific APM vendor.
Translate to Datadog / Grafana / Honeycomb query language when wiring production alerts.

## Parse-retry rate

- **Query:** `agent_router_parse_retry_total{tenant_id} / agent_router_decisions_total{tenant_id}`
- **Alert:** >5% sustained over 15 minutes per tenant.
- **Signal:** prompt regression — the router LLM is producing schema-invalid output more often than baseline.

## Disambiguation rate

- **Query:** `agent_router_decisions_total{tenant_id, outcome='disambiguation'} + agent_router_decisions_total{tenant_id, outcome='parse_escalated'}` as a fraction of total decisions.
- **Alert:** >15% sustained over 1 hour per tenant.
- **Signal:** router prompt or sub-agent scope too narrow — utterances can't be mapped to the available catalog.

## Narrative cache hit ratio

- **Query:** `agent_narrative_cache_total{tenant_id, outcome='hit'} / (hit + miss)`.
- **Alert:** <90% after first week per tenant.
- **Signal:** permission churn abnormal — role/permission changes are invalidating the narrative cache at an unhealthy rate.

## Sub-agent hidden (product signal)

- **Query:** `agent_sub_agent_hidden_total{tenant_id, reason}` by reason.
- **Alert (reason='module_disabled'):** sustained non-zero indicates a tenant would benefit from enabling the module.
- **Alert (reason='permission_empty_scope'):** sustained non-zero indicates a role is missing the permissions needed to use a sub-agent the router would have matched.

## Sub-agent invoked (usage telemetry)

- **Query:** `agent_sub_agent_invoked_total{tenant_id, sub_agent_key, phase}`.
- **Purpose:** per-sub-agent utilization tracking + compliance trail.
- **No alert:** this is an information-only feed.
