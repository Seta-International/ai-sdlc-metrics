-- Fix: replace non-partial unique index on idp_group_mapping with two
-- partial unique indexes (null-safe and non-null variants).
-- The old index uq_idp_group_mapping_role_scope treated NULL scope_id
-- as equal, making it impossible to have multiple global (scope_id IS NULL)
-- mappings with the same (tenant_id, external_group_id, role_key, scope_type).
-- This migration is idempotent: safe to run on DBs that already have the
-- correct partial indexes.
DROP INDEX IF EXISTS "identity"."uq_idp_group_mapping_role_scope";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_idp_group_mapping_role_scope_scoped" ON "identity"."idp_group_mapping" USING btree ("tenant_id","external_group_id","role_key","scope_type","scope_id") WHERE "identity"."idp_group_mapping"."scope_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_idp_group_mapping_role_scope_global" ON "identity"."idp_group_mapping" USING btree ("tenant_id","external_group_id","role_key","scope_type") WHERE "identity"."idp_group_mapping"."scope_id" IS NULL;
