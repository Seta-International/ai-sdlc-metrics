-- FORCE RLS plus tenant_user GRANTs. drizzle-kit 0.31.10 does not model
-- these clauses, so they live in a hand-authored migration. Mirrors the
-- platform/oauth pattern in 0001_security_hardening.sql.
ALTER TABLE "agent_memory"."conversations" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "agent_memory"."turns" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "agent_memory"."working_memory" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
GRANT USAGE ON SCHEMA "agent_memory" TO "tenant_user";--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "agent_memory"."conversations" TO "tenant_user";--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "agent_memory"."turns" TO "tenant_user";--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "agent_memory"."working_memory" TO "tenant_user";
