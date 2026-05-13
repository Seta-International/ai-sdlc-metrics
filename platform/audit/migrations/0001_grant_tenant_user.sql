-- tenant_user is the application role per CLAUDE.md "App connects as tenant_user".
-- It needs INSERT on audit.audit_log to write audit rows from within
-- request-scoped transactions. The audit log itself has no RLS — tenants
-- write their own rows (tenant_id is the natural partition); add row-level
-- isolation later if cross-tenant audit reads become a concern.
GRANT USAGE ON SCHEMA "audit" TO "tenant_user";--> statement-breakpoint
GRANT INSERT, SELECT ON "audit"."audit_log" TO "tenant_user";--> statement-breakpoint
GRANT USAGE, SELECT ON SEQUENCE "audit"."audit_log_id_seq" TO "tenant_user";
