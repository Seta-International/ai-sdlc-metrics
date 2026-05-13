-- FORCE RLS plus tenant_user GRANTs. drizzle-kit 0.31.10 does not model
-- these clauses, so they live in a hand-authored migration. Mirrors the
-- platform/agent/memory pattern in 0001_security_hardening.sql.
ALTER TABLE "agent_workflows"."workflow_snapshots" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "agent_workflows"."workflow_steps" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
GRANT USAGE ON SCHEMA "agent_workflows" TO "tenant_user";--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "agent_workflows"."workflow_snapshots" TO "tenant_user";--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "agent_workflows"."workflow_steps" TO "tenant_user";
