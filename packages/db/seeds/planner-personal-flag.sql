-- Flips planner.personal.enabled = true for the SETA internal tenant.
-- Idempotent — re-runnable without effect once applied.
--
-- Tenant resolution uses the canonical slug `seta`. If your deployment uses a
-- different slug, replace the WHERE clause accordingly (or look up the tenant
-- id first via `SELECT id, name, slug FROM core.tenant ORDER BY created_at`).
--
-- Rollout:
--   psql "$DATABASE_URL"         -f packages/db/seeds/planner-personal-flag.sql
--   psql "$STAGING_DATABASE_URL" -f packages/db/seeds/planner-personal-flag.sql
--   psql "$PROD_DATABASE_URL"    -f packages/db/seeds/planner-personal-flag.sql

INSERT INTO admin.tenant_settings (tenant_id, planner_personal_enabled, timezone)
SELECT t.id, true, 'Asia/Ho_Chi_Minh'
FROM core.tenant t
WHERE t.slug = 'seta'
ON CONFLICT (tenant_id) DO UPDATE
  SET planner_personal_enabled = true;
