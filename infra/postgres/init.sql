-- Run once on a fresh Postgres instance. Idempotent: safe to re-run.
-- Loaded by docker-compose (manual exec) and by CI integration job.

-- Extensions
CREATE EXTENSION IF NOT EXISTS vector;       -- pgvector
CREATE EXTENSION IF NOT EXISTS pg_trgm;      -- trigram + FTS rank helpers
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Roles
-- `seta_admin` runs migrations and ops scripts; bypasses RLS.
-- `tenant_user` runs the application; subject to RLS policies.
-- Passwords for local dev only; production sets these via the cloud-managed instance.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'seta_admin') THEN
    CREATE ROLE seta_admin LOGIN PASSWORD 'dev' BYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tenant_user') THEN
    CREATE ROLE tenant_user LOGIN PASSWORD 'dev';
  END IF;
END
$$;

GRANT ALL ON SCHEMA public TO seta_admin;
GRANT USAGE ON SCHEMA public TO tenant_user;

-- Default privileges: any future tables created by seta_admin grant SELECT/INSERT/UPDATE/DELETE
-- to tenant_user (RLS still gates row visibility).
ALTER DEFAULT PRIVILEGES FOR ROLE seta_admin IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO tenant_user;
ALTER DEFAULT PRIVILEGES FOR ROLE seta_admin IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO tenant_user;
