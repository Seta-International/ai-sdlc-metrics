-- Run once on a fresh Postgres instance. Idempotent: safe to re-run.
-- Loaded by docker-compose (manual exec) and by CI integration job.

-- Extensions
CREATE EXTENSION IF NOT EXISTS vector;       -- pgvector
CREATE EXTENSION IF NOT EXISTS pg_trgm;      -- trigram + FTS rank helpers
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Roles
-- `platform_admin` runs migrations and ops scripts; bypasses RLS.
-- `tenant_user` runs the application; subject to RLS policies.
-- Passwords for local dev only; production sets these via the cloud-managed instance.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'platform_admin') THEN
    CREATE ROLE platform_admin WITH LOGIN BYPASSRLS PASSWORD 'dev_only_change_me';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tenant_user') THEN
    CREATE ROLE tenant_user WITH LOGIN PASSWORD 'dev_only_change_me';
  END IF;
END
$$;

-- Grant on the current database (works for `seta`, `seta_test`, etc.).
DO $$
BEGIN
  EXECUTE format('GRANT ALL ON DATABASE %I TO platform_admin', current_database());
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO tenant_user', current_database());
END
$$;

GRANT ALL ON SCHEMA public TO platform_admin;
GRANT USAGE ON SCHEMA public TO tenant_user;

-- Default privileges: any future tables created by platform_admin grant SELECT/INSERT/UPDATE/DELETE
-- to tenant_user (RLS still gates row visibility). Per-schema USAGE grants are emitted by each
-- owner's migrations.
ALTER DEFAULT PRIVILEGES FOR ROLE platform_admin IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO tenant_user;
ALTER DEFAULT PRIVILEGES FOR ROLE platform_admin IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO tenant_user;
