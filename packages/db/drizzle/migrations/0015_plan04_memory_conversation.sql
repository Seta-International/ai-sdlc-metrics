-- Plan 04 — Memory L1-L4 + Conversation State
-- Renames the old UI chat message table and introduces the agent runtime memory schema.

-- ─── 1. Rename old UI chat message table ───────────────────────────────────────
-- The old agent_message table (session_id FK → agent_chat_session) was the web-chat
-- message store. Plan 04 introduces a new agent_message with conversation_id FK →
-- agent_conversation. Rename the old table to avoid collision.
ALTER TABLE "agents"."agent_message" RENAME TO "agent_chat_message";
--> statement-breakpoint

-- ─── 2. agent_conversation ──────────────────────────────────────────────────────
-- Scope key (tenant_id, user_id, surface) with partial unique index on active rows
-- enforces cross-device consolidation: at most one active conversation per scope.
CREATE TABLE "agents"."agent_conversation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"surface" text NOT NULL,
	"status" text NOT NULL DEFAULT 'active',
	"title" text,
	"last_user_turn_at" timestamp with time zone,
	"updated_at" timestamp with time zone NOT NULL DEFAULT now(),
	"archived_at" timestamp with time zone,
	"summary_failure_streak" integer NOT NULL DEFAULT 0,
	"summary_disabled_at" timestamp with time zone,
	CONSTRAINT "agent_conversation_status_check" CHECK ("agents"."agent_conversation"."status" IN ('active', 'archived'))
);
--> statement-breakpoint

-- ─── 3. agent_message (Plan 04) ─────────────────────────────────────────────────
-- JSONB content (structured tool calls + results), nullable summary (post-turn
-- async), trace_id for kernel audit correlation.
-- content is nullable: GDPR erasure (hardDeleteContent) NULLs it in-place (R-04.28).
-- ON DELETE CASCADE: hard_delete retention mode deletes the conversation row;
--   child messages must cascade or the DELETE will fail with a FK violation.
-- user_id is denormalized from agent_conversation for keyset pagination (R-04.10).
CREATE TABLE "agents"."agent_message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL REFERENCES "agents"."agent_conversation"("id") ON DELETE CASCADE,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" jsonb,
	"summary" text,
	"trace_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL DEFAULT now(),
	CONSTRAINT "agent_message_role_check" CHECK ("agents"."agent_message"."role" IN ('user', 'assistant', 'system'))
);
--> statement-breakpoint

-- ─── 4. agent_l3_preference ─────────────────────────────────────────────────────
-- User preferences that exist ONLY because the agent exists (display format,
-- currency display, etc.). Writes are user-initiated at MVP (no agent meta tag).
-- Key is allowlisted at write time — unknown keys are rejected at the service layer.
CREATE TABLE "agents"."agent_l3_preference" (
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone NOT NULL DEFAULT now(),
	"updated_by" uuid NOT NULL,
	CONSTRAINT "agent_l3_preference_pk" PRIMARY KEY ("tenant_id", "user_id", "key")
);
--> statement-breakpoint

-- ─── 5. agent_scratchpad (L3.5 — MVP) ──────────────────────────────────────────
-- Schema-allowlisted per-sub-agent fields. Taint bit travels with the value.
-- Scope key: (tenant_id, user_id) — never (tenant_id, module) per EI-9.
-- Written exclusively via the kernel-audited scratchpad.write tool.
CREATE TABLE "agents"."agent_scratchpad" (
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"field" text NOT NULL,
	"value" jsonb NOT NULL,
	"tainted" boolean NOT NULL DEFAULT false,
	"updated_at" timestamp with time zone NOT NULL DEFAULT now(),
	CONSTRAINT "agent_scratchpad_pk" PRIMARY KEY ("tenant_id", "user_id", "field")
);
--> statement-breakpoint

-- ─── Indexes ────────────────────────────────────────────────────────────────────

-- agent_conversation: at most one active conversation per scope key (R-04.5)
CREATE UNIQUE INDEX "agent_conversation_scope_active_uidx"
  ON "agents"."agent_conversation" ("tenant_id", "user_id", "surface")
  WHERE "status" = 'active';
--> statement-breakpoint

-- agent_conversation: list + sorting by recency
CREATE INDEX "agent_conversation_tenant_user_status_updated_idx"
  ON "agents"."agent_conversation" ("tenant_id", "user_id", "status", "updated_at" DESC);
--> statement-breakpoint

-- agent_message: keyset pagination (R-04.10)
CREATE INDEX "agent_message_tenant_user_conv_created_idx"
  ON "agents"."agent_message" ("tenant_id", "user_id", "conversation_id", "created_at");
--> statement-breakpoint

-- agent_message: FTS on user utterances + summaries ONLY (R-04.8)
-- Never indexes raw tool-result content; only role='user' text and summary text.
CREATE INDEX "agent_message_fts_idx"
  ON "agents"."agent_message"
  USING gin (
    to_tsvector('simple',
      COALESCE(
        CASE WHEN "role" = 'user' THEN ("content" ->> 'text') ELSE NULL END,
        ''
      ) || ' ' ||
      COALESCE("summary", '')
    )
  );
--> statement-breakpoint

-- ─── RLS ────────────────────────────────────────────────────────────────────────

ALTER TABLE "agents"."agent_conversation" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "agents"."agent_conversation" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "agents"."agent_conversation"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
--> statement-breakpoint

ALTER TABLE "agents"."agent_message" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "agents"."agent_message" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "agents"."agent_message"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
--> statement-breakpoint

ALTER TABLE "agents"."agent_l3_preference" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "agents"."agent_l3_preference" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "agents"."agent_l3_preference"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
--> statement-breakpoint

ALTER TABLE "agents"."agent_scratchpad" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "agents"."agent_scratchpad" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "agents"."agent_scratchpad"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
--> statement-breakpoint

-- Re-enable RLS on the renamed table (rename does not affect policies)
ALTER TABLE "agents"."agent_chat_message" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "agents"."agent_chat_message" FORCE ROW LEVEL SECURITY;
