CREATE SCHEMA "admin";
--> statement-breakpoint
CREATE SCHEMA "agents";
--> statement-breakpoint
CREATE SCHEMA "documents";
--> statement-breakpoint
CREATE SCHEMA "finance";
--> statement-breakpoint
CREATE SCHEMA "goals";
--> statement-breakpoint
CREATE SCHEMA "hiring";
--> statement-breakpoint
CREATE SCHEMA "identity";
--> statement-breakpoint
CREATE SCHEMA "insights";
--> statement-breakpoint
CREATE SCHEMA "core";
--> statement-breakpoint
CREATE SCHEMA "notifications";
--> statement-breakpoint
CREATE SCHEMA "people";
--> statement-breakpoint
CREATE SCHEMA "performance";
--> statement-breakpoint
CREATE SCHEMA "planner";
--> statement-breakpoint
CREATE SCHEMA "preferences";
--> statement-breakpoint
CREATE SCHEMA "projects";
--> statement-breakpoint
CREATE SCHEMA "time";
--> statement-breakpoint
CREATE TABLE "admin"."tenant_ai_provider_config" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"provider_type" text NOT NULL,
	"api_key_ref" text NOT NULL,
	"api_key_last_four" text,
	"default_reasoning_model" text DEFAULT 'gpt-5.4' NOT NULL,
	"default_classification_model" text DEFAULT 'gpt-5.4-nano' NOT NULL,
	"embedding_model" text DEFAULT 'text-embedding-3-small' NOT NULL,
	"status" text DEFAULT 'needs_attention' NOT NULL,
	"last_validated_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_ai_provider_config_tenant_id_unique" UNIQUE("tenant_id")
);
--> statement-breakpoint
CREATE TABLE "admin"."tenant_email_config" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"from_address" text NOT NULL,
	"smtp_host" text,
	"smtp_port" integer,
	"credential_ref" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_email_config_tenant_id_unique" UNIQUE("tenant_id")
);
--> statement-breakpoint
CREATE TABLE "admin"."tenant_module_toggle" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"module_key" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin"."tenant_settings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"planner_core_enabled" boolean DEFAULT false NOT NULL,
	"planner_views_enabled" boolean DEFAULT false NOT NULL,
	"planner_grid_enabled" boolean DEFAULT false NOT NULL,
	"planner_schedule_enabled" boolean DEFAULT false NOT NULL,
	"planner_charts_enabled" boolean DEFAULT false NOT NULL,
	"planner_charts_trends_enabled" boolean DEFAULT false NOT NULL,
	"planner_personal_enabled" boolean DEFAULT false NOT NULL,
	"planner_ms_sync_enabled" boolean DEFAULT false NOT NULL,
	"timezone" text DEFAULT 'Asia/Ho_Chi_Minh' NOT NULL,
	"max_sampled_turns_per_day" integer DEFAULT 10000 NOT NULL,
	"max_active_schedules" integer DEFAULT 100 NOT NULL,
	"scheduled_spend_daily_limit_usd" numeric(10, 2),
	"default_schedule_failure_alert_policy" text DEFAULT 'owner_and_admin' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_settings_tenant_id_unique" UNIQUE("tenant_id")
);
--> statement-breakpoint
CREATE TABLE "agents"."agent_draft" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"trace_id" uuid NOT NULL,
	"flow_id" uuid NOT NULL,
	"initiator_user_id" uuid NOT NULL,
	"on_behalf_of" uuid,
	"via_delegation_id" uuid NOT NULL,
	"via_schedule_id" uuid,
	"approver_user_id" uuid,
	"tier" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"tool_name" text NOT NULL,
	"args" jsonb NOT NULL,
	"expected_output_shape" text,
	"permission_envelope_at_draft_time" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"approval_freshness" text NOT NULL,
	"approval_ttl" interval DEFAULT '72 hours' NOT NULL,
	"drafted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"approved_at" timestamp with time zone,
	"executed_at" timestamp with time zone,
	"execution_outcome" text,
	"provenance" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"taint_at_draft_time" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agents"."agent_iteration" (
	"id" uuid PRIMARY KEY NOT NULL,
	"trace_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"turn_id" uuid NOT NULL,
	"iteration_number" integer NOT NULL,
	"sub_agent_key" text NOT NULL,
	"selection_reason" text NOT NULL,
	"completion_scorer_results" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_complete" boolean DEFAULT false NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"usage" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"taint_at_start" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agents"."agent_cost_reconciliation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"week_start" date NOT NULL,
	"agent_cost_event_sum_usd" numeric(12, 6) NOT NULL,
	"vendor_invoice_sum_usd" numeric(12, 6) NOT NULL,
	"divergence_pct" numeric(8, 4) NOT NULL,
	"divergence_over_threshold" boolean NOT NULL,
	"computed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "agent_cost_reconciliation_divergence_pct_check" CHECK ("agents"."agent_cost_reconciliation"."divergence_pct" >= -100 AND "agents"."agent_cost_reconciliation"."divergence_pct" <= 100)
);
--> statement-breakpoint
CREATE TABLE "agents"."agent_ga_readiness_state" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"is_ga_ready" boolean NOT NULL,
	"computed_at" timestamp with time zone NOT NULL,
	"missing_criteria" jsonb NOT NULL,
	"consecutive_windows_met" integer DEFAULT 0 NOT NULL,
	"window_started_passing_at" timestamp with time zone,
	"tenant_count" integer NOT NULL,
	"interactive_turns_per_day" integer NOT NULL,
	"p1_security_incidents_last_90d" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agents"."agent_p1_incident_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"opened_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone,
	"severity" text NOT NULL,
	"category" text NOT NULL,
	"summary" text NOT NULL,
	"post_mortem_url" text,
	CONSTRAINT "agent_p1_incident_log_severity_check" CHECK ("agents"."agent_p1_incident_log"."severity" IN ('P1', 'P2')),
	CONSTRAINT "agent_p1_incident_log_category_check" CHECK ("agents"."agent_p1_incident_log"."category" IN ('security', 'reliability', 'cost', 'observability'))
);
--> statement-breakpoint
CREATE TABLE "agents"."agent_readiness_check" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criterion_id" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"window_end" timestamp with time zone NOT NULL,
	"observed_value" text NOT NULL,
	"threshold" text NOT NULL,
	"passed" boolean NOT NULL,
	"notes" text,
	"computed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agents"."agent_runbook_dry_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"runbook_id" text NOT NULL,
	"executed_at" timestamp with time zone NOT NULL,
	"executed_by" uuid NOT NULL,
	"outcome" text NOT NULL,
	"post_mortem_url" text,
	"time_to_recovery_minutes" integer,
	CONSTRAINT "agent_runbook_dry_run_outcome_check" CHECK ("agents"."agent_runbook_dry_run"."outcome" IN ('pass', 'pass_with_notes', 'fail')),
	CONSTRAINT "agent_runbook_dry_run_runbook_id_check" CHECK ("agents"."agent_runbook_dry_run"."runbook_id" IN ('provider_outage', 'budget_exhaustion_midflight', 'quality_canary_degradation', 'cross_tenant_leak_alert', 'content_hash_store_miss', 'adapter_dropped_cache_fields', 'approval_inbox_flood', 'gdpr_erasure_partial_success'))
);
--> statement-breakpoint
CREATE TABLE "agents"."agent_schedule_run" (
	"id" uuid PRIMARY KEY NOT NULL,
	"schedule_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"trace_id" uuid NOT NULL,
	"flow_id" uuid NOT NULL,
	"pg_boss_job_id" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"outcome" text,
	"taint_seeded" boolean DEFAULT false NOT NULL,
	"pinned_versions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"cost_spent_usd" numeric(12, 6) DEFAULT '0' NOT NULL,
	"fired_by" text NOT NULL,
	"parent_trace_id" uuid
);
--> statement-breakpoint
CREATE TABLE "agents"."agent_schedule" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"owner_user_id" uuid,
	"created_by" uuid NOT NULL,
	"trigger_kind" text NOT NULL,
	"cron_expression" text,
	"event_subscription" jsonb,
	"prompt" text NOT NULL,
	"delegation_id" uuid NOT NULL,
	"cost_ceiling_daily_usd" numeric(10, 2) DEFAULT '1.00' NOT NULL,
	"invocation_ceiling_daily" integer DEFAULT 10 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"pause_reason" text,
	"consecutive_failure_count" integer DEFAULT 0 NOT NULL,
	"failure_alert_policy" text DEFAULT 'owner_and_admin' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agents"."agent_semantic_index" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"sub_agent_id" text,
	"source_id" uuid NOT NULL,
	"source_type" text NOT NULL,
	"chunk_text" text NOT NULL,
	"embedding" jsonb NOT NULL,
	"embedding_model" text NOT NULL,
	"retention_policy" text DEFAULT '90d' NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agents"."agent_tool_embedding" (
	"tool_name" text NOT NULL,
	"content_hash" text NOT NULL,
	"embedding" jsonb NOT NULL,
	"descriptor_snapshot" jsonb NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_tool_embedding_tool_name_content_hash_pk" PRIMARY KEY("tool_name","content_hash")
);
--> statement-breakpoint
CREATE TABLE "agents"."agent_tool_result_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tool_name" text NOT NULL,
	"canonical_args_hash" text NOT NULL,
	"semantic_embedding" jsonb,
	"embedding_model" text NOT NULL,
	"result" jsonb NOT NULL,
	"stored_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ttl_seconds" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agents"."agent_active_turn" (
	"trace_id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"conversation_id" uuid,
	"pod_id" text NOT NULL,
	"surface" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_heartbeat_at" timestamp with time zone DEFAULT now() NOT NULL,
	"abort_pending" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agents"."agent_canary_query" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tier" text NOT NULL,
	"utterance" text NOT NULL,
	"tenant_id" uuid NOT NULL,
	"expected_answer_contract" jsonb NOT NULL,
	"rotation_quarter" text NOT NULL,
	"source" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	CONSTRAINT "agent_canary_query_tier_check" CHECK ("agents"."agent_canary_query"."tier" IN ('full', 'nano')),
	CONSTRAINT "agent_canary_query_source_check" CHECK ("agents"."agent_canary_query"."source" IN ('production_anonymized', 'manually_authored')),
	CONSTRAINT "agent_canary_query_status_check" CHECK ("agents"."agent_canary_query"."status" IN ('active', 'retired'))
);
--> statement-breakpoint
CREATE TABLE "agents"."agent_canary_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"tier" text NOT NULL,
	"canary_query_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"trace_id" uuid NOT NULL,
	"outcome" text NOT NULL,
	"score" numeric(5, 4) NOT NULL,
	"duration_ms" integer NOT NULL,
	CONSTRAINT "agent_canary_run_tier_check" CHECK ("agents"."agent_canary_run"."tier" IN ('full', 'nano')),
	CONSTRAINT "agent_canary_run_outcome_check" CHECK ("agents"."agent_canary_run"."outcome" IN ('passed', 'failed', 'error')),
	CONSTRAINT "agent_canary_run_score_range_check" CHECK ("agents"."agent_canary_run"."score" >= 0 AND "agents"."agent_canary_run"."score" <= 1)
);
--> statement-breakpoint
CREATE TABLE "agents"."agent_chat_message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"tool_name" text,
	"tool_args" jsonb,
	"model_used" text,
	"tokens_used" integer,
	"is_error" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agents"."agent_chat_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"agent_id" uuid,
	"channel_type" text DEFAULT 'web_chat' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"context_module" text,
	"context_entity" text,
	"context_entity_id" text,
	"context_metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "agents"."agent_message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" jsonb,
	"summary" text,
	"trace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_message_role_check" CHECK ("agents"."agent_message"."role" IN ('user', 'assistant', 'system'))
);
--> statement-breakpoint
CREATE TABLE "agents"."agent_conversation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"surface" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"title" text,
	"last_user_turn_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	"summary_failure_streak" integer DEFAULT 0 NOT NULL,
	"summary_disabled_at" timestamp with time zone,
	CONSTRAINT "agent_conversation_status_check" CHECK ("agents"."agent_conversation"."status" IN ('active', 'archived'))
);
--> statement-breakpoint
CREATE TABLE "agents"."agent_cost_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trace_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid,
	"pricing_id" uuid NOT NULL,
	"priced_at" timestamp with time zone NOT NULL,
	"model_id" text NOT NULL,
	"usage_input_uncached" integer DEFAULT 0 NOT NULL,
	"usage_input_cached_read" integer DEFAULT 0 NOT NULL,
	"usage_input_cached_write" integer DEFAULT 0 NOT NULL,
	"usage_output" integer DEFAULT 0 NOT NULL,
	"usage_output_reasoning" integer DEFAULT 0 NOT NULL,
	"cost_usd" numeric(12, 6) NOT NULL,
	"layer" text NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"attempt_duration_ms" integer DEFAULT 0 NOT NULL,
	"total_duration_ms" integer DEFAULT 0 NOT NULL,
	"via_schedule_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_cost_event_layer_check" CHECK ("agents"."agent_cost_event"."layer" IN ('router','synthesizer','summarizer') OR "agents"."agent_cost_event"."layer" LIKE 'sub_agent:%')
);
--> statement-breakpoint
CREATE TABLE "agents"."agent_golden_trace" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"tenant_id" uuid NOT NULL,
	"seed_user_id" uuid NOT NULL,
	"user_utterance" text NOT NULL,
	"expected_tool_calls" jsonb NOT NULL,
	"expected_shape" text NOT NULL,
	"expected_permission_keys" jsonb NOT NULL,
	"taint_expectation" boolean NOT NULL,
	"answer_shape_contract" jsonb NOT NULL,
	"adversarial_category" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone,
	"removal_reason" text,
	CONSTRAINT "agent_golden_trace_expected_shape_check" CHECK ("agents"."agent_golden_trace"."expected_shape" IN ('short-answer', 'list', 'table', 'narrative', 'chart', 'refusal')),
	CONSTRAINT "agent_golden_trace_adversarial_category_check" CHECK ("agents"."agent_golden_trace"."adversarial_category" IS NULL OR "agents"."agent_golden_trace"."adversarial_category" IN ('sanitization-projection', 'taint-escalation', 'permission-denial', 'disambiguation', 'contradiction'))
);
--> statement-breakpoint
CREATE TABLE "agents"."agent_insight" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"module" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"severity" text DEFAULT 'info' NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"action_label" text,
	"action_href" text,
	"is_dismissed" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agents"."agent_l3_preference" (
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL,
	CONSTRAINT "agent_l3_preference_pk" PRIMARY KEY("tenant_id","user_id","key")
);
--> statement-breakpoint
CREATE TABLE "agents"."agent_narrative_store" (
	"content_hash" text PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"role_key" text NOT NULL,
	"content" text NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agents"."agent_pricing" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_id" text NOT NULL,
	"input_usd_per_mtok" numeric(10, 4) NOT NULL,
	"input_cached_read_usd_per_mtok" numeric(10, 4) NOT NULL,
	"input_cached_write_usd_per_mtok" numeric(10, 4) NOT NULL,
	"output_usd_per_mtok" numeric(10, 4) NOT NULL,
	"output_reasoning_usd_per_mtok" numeric(10, 4) NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"effective_until" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "agents"."agent_prompt_store" (
	"content_hash" text PRIMARY KEY NOT NULL,
	"layer" text NOT NULL,
	"content" text NOT NULL,
	"tenant_id" uuid NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agents"."agent_rate_limit_counter" (
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"limit_key" text NOT NULL,
	"bucket" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_rate_limit_counter_pk" PRIMARY KEY("tenant_id","user_id","limit_key","bucket"),
	CONSTRAINT "agent_rate_limit_counter_limit_key_check" CHECK ("agents"."agent_rate_limit_counter"."limit_key" IN ('queries/user/min', 'l3_writes/user/day', 'schedule_creations/user/day'))
);
--> statement-breakpoint
CREATE TABLE "agents"."agent_rollout_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"change_class" text NOT NULL,
	"candidate_version" text NOT NULL,
	"baseline_version" text NOT NULL,
	"stability_key" text NOT NULL,
	"traffic_percentage" numeric(5, 2) NOT NULL,
	"shadow_enabled" boolean DEFAULT false NOT NULL,
	"auto_rollback_enabled" boolean DEFAULT true NOT NULL,
	"regression_thresholds" jsonb NOT NULL,
	"status" text DEFAULT 'drafting' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"activated_at" timestamp with time zone,
	"completed_or_rolled_back_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	CONSTRAINT "agent_rollout_config_change_class_check" CHECK ("agents"."agent_rollout_config"."change_class" IN ('router', 'planner', 'model', 'tool_meta', 'sub_agent_prompt')),
	CONSTRAINT "agent_rollout_config_stability_key_check" CHECK ("agents"."agent_rollout_config"."stability_key" IN ('tenant_id', 'tenant_id+user_id')),
	CONSTRAINT "agent_rollout_config_traffic_percentage_check" CHECK ("agents"."agent_rollout_config"."traffic_percentage" >= 0 AND "agents"."agent_rollout_config"."traffic_percentage" <= 100),
	CONSTRAINT "agent_rollout_config_status_check" CHECK ("agents"."agent_rollout_config"."status" IN ('drafting', 'active', 'rolled_back', 'completed'))
);
--> statement-breakpoint
CREATE TABLE "agents"."agent_rollout_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"rollout_config_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"from_percentage" numeric(5, 2),
	"to_percentage" numeric(5, 2),
	"reason" text NOT NULL,
	"triggered_by" text NOT NULL,
	"ts" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_rollout_event_event_type_check" CHECK ("agents"."agent_rollout_event"."event_type" IN ('activated', 'percentage_shifted', 'auto_rolled_back', 'manually_rolled_back', 'completed'))
);
--> statement-breakpoint
CREATE TABLE "agents"."agent_scorer_registration" (
	"scorer_id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"scope" text NOT NULL,
	"registered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"meta_eval_agreement" numeric(5, 4),
	"status" text DEFAULT 'provisional' NOT NULL,
	CONSTRAINT "agent_scorer_registration_kind_check" CHECK ("agents"."agent_scorer_registration"."kind" IN ('deterministic', 'llm-judge')),
	CONSTRAINT "agent_scorer_registration_scope_check" CHECK ("agents"."agent_scorer_registration"."scope" IN ('live', 'trace', 'experiment', 'test')),
	CONSTRAINT "agent_scorer_registration_status_check" CHECK ("agents"."agent_scorer_registration"."status" IN ('provisional', 'gating_eligible')),
	CONSTRAINT "agent_scorer_registration_meta_eval_range_check" CHECK ("agents"."agent_scorer_registration"."meta_eval_agreement" IS NULL OR ("agents"."agent_scorer_registration"."meta_eval_agreement" >= 0 AND "agents"."agent_scorer_registration"."meta_eval_agreement" <= 1))
);
--> statement-breakpoint
CREATE TABLE "agents"."agent_scratchpad" (
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"field" text NOT NULL,
	"value" jsonb NOT NULL,
	"tainted" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_scratchpad_pk" PRIMARY KEY("tenant_id","user_id","field")
);
--> statement-breakpoint
CREATE TABLE "agents"."agent_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"router_prompt_hash" text NOT NULL,
	"permission_narrative_hash" text NOT NULL,
	"tool_catalog_hash" text NOT NULL,
	"directive_schema_hash" text NOT NULL,
	"canonicalizer_version_hash" text NOT NULL,
	"pinned_sub_agent_prompt_hashes" jsonb NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "agents"."agent_shadow_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"baseline_trace_id" uuid NOT NULL,
	"shadow_trace_id" uuid NOT NULL,
	"rollout_config_id" uuid NOT NULL,
	"candidate_version" text NOT NULL,
	"baseline_version" text NOT NULL,
	"diff_score" numeric(5, 4) NOT NULL,
	"diff_category" text NOT NULL,
	"ts" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_shadow_run_diff_category_check" CHECK ("agents"."agent_shadow_run"."diff_category" IN ('identical', 'minor_difference', 'major_difference', 'shadow_errored')),
	CONSTRAINT "agent_shadow_run_diff_score_range_check" CHECK ("agents"."agent_shadow_run"."diff_score" >= 0 AND "agents"."agent_shadow_run"."diff_score" <= 1)
);
--> statement-breakpoint
CREATE TABLE "agents"."agent_stored_sub_agent" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"key" text NOT NULL,
	"config" jsonb NOT NULL,
	"version" integer NOT NULL,
	"status" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_stored_sub_agent_status_check" CHECK ("agents"."agent_stored_sub_agent"."status" IN ('draft', 'active', 'retired'))
);
--> statement-breakpoint
CREATE TABLE "agents"."agent_tenant_budget" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"daily_limit_usd" numeric(10, 2) DEFAULT '50' NOT NULL,
	"remaining_usd" numeric(12, 6) NOT NULL,
	"last_refilled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agents"."agent_tool_invocation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trace_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"tool_name" text NOT NULL,
	"args" jsonb NOT NULL,
	"result_preview" "bytea",
	"result_hash" text,
	"byte_count" integer,
	"result_status" text NOT NULL,
	"sub_agent_key" text,
	"phase" integer NOT NULL,
	"iteration" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agents"."agent_turn_sampling_decision" (
	"trace_id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"capture" boolean NOT NULL,
	"root_decision_reason" text NOT NULL,
	"triggers_matched_at_root" text[] DEFAULT '{}' NOT NULL,
	"triggers_matched_retroactively" text[] DEFAULT '{}' NOT NULL,
	"tenant_quota_exhausted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agents"."agent_user_budget" (
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"daily_limit_usd" numeric(10, 2) NOT NULL,
	"remaining_usd" numeric(12, 6) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_user_budget_pk" PRIMARY KEY("tenant_id","user_id","date")
);
--> statement-breakpoint
CREATE TABLE "documents"."generation_job" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"requested_by" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"input_data" jsonb NOT NULL,
	"output_file_key" text,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "documents"."template" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"format" text NOT NULL,
	"content" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents"."tenant_branding" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"company_name" text NOT NULL,
	"logo_file_key" text,
	"primary_color" text,
	"font_family" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_branding_tenant_id_unique" UNIQUE("tenant_id")
);
--> statement-breakpoint
CREATE TABLE "identity"."api_key" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"key_hash" text NOT NULL,
	"key_last_four" text NOT NULL,
	"name" text NOT NULL,
	"last_used_at" timestamp,
	"expires_at" timestamp,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity"."identity_provider" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"provider_type" text NOT NULL,
	"display_name" text NOT NULL,
	"client_id" text NOT NULL,
	"client_secret_ref" text NOT NULL,
	"directory_id" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"sync_enabled" boolean DEFAULT false NOT NULL,
	"last_sync_at" timestamp,
	"sync_status" text DEFAULT 'idle' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity"."idp_group_mapping" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"identity_provider_id" uuid NOT NULL,
	"external_group_id" text NOT NULL,
	"external_group_name" text NOT NULL,
	"role_key" text NOT NULL,
	"scope_type" text NOT NULL,
	"scope_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity"."idp_group_member" (
	"tenant_id" uuid NOT NULL,
	"external_group_id" text NOT NULL,
	"sso_subject" text NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idp_group_member_tenant_id_external_group_id_sso_subject_pk" PRIMARY KEY("tenant_id","external_group_id","sso_subject")
);
--> statement-breakpoint
CREATE TABLE "identity"."magic_link_token" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"email" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity"."ms_graph_credential" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"client_secret_ref" text NOT NULL,
	"tenant_ad_id" text NOT NULL,
	"scopes" text[] NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"consented_at" timestamp with time zone NOT NULL,
	"last_validated_at" timestamp with time zone,
	"last_error" text,
	"tenant_push_paused_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity"."oauth_authorization_session" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"provider_id" uuid NOT NULL,
	"provider_type" text NOT NULL,
	"state_hash" text NOT NULL,
	"nonce_hash" text NOT NULL,
	"callback_uri" text NOT NULL,
	"redirect_to" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity"."sync_history" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"identity_provider_id" uuid NOT NULL,
	"status" text NOT NULL,
	"users_created" integer DEFAULT 0 NOT NULL,
	"users_deactivated" integer DEFAULT 0 NOT NULL,
	"roles_changed" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"started_at" timestamp NOT NULL,
	"completed_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity"."tenant_domain" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"domain" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"verification_token_hash" text NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."actor" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"type" text NOT NULL,
	"display_name" text NOT NULL,
	"status" text DEFAULT 'invited' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."agent_delegation" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"delegator_user_id" uuid,
	"delegate" text NOT NULL,
	"scope" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"autonomous_writes_allowed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."audit_event" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"module" text NOT NULL,
	"subject_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"flow_id" uuid,
	"intent_slug" varchar(120),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."decision_case" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"module" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"requested_by" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."decision_outcome" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"final_action" text NOT NULL,
	"decided_by" uuid NOT NULL,
	"decided_at" timestamp DEFAULT now() NOT NULL,
	"comment" text
);
--> statement-breakpoint
CREATE TABLE "core"."decision_step" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"step_order" integer NOT NULL,
	"approver_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"comment" text,
	"decided_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "core"."delegation" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"delegator_id" uuid NOT NULL,
	"delegatee_id" uuid NOT NULL,
	"role" text NOT NULL,
	"valid_from" timestamp NOT NULL,
	"valid_until" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."department" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"parent_id" uuid,
	"cost_center_code" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."exposure_contract" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tool_name" text NOT NULL,
	"scope_id" uuid NOT NULL,
	"allowed_roles" text[] NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."external_identity_map" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"system_name" text NOT NULL,
	"external_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."org_placement" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"department_id" uuid NOT NULL,
	"manager_id" uuid,
	"effective_from" timestamp NOT NULL,
	"effective_until" timestamp
);
--> statement-breakpoint
CREATE TABLE "core"."outbox_event" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"event_name" text NOT NULL,
	"payload" jsonb NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"published_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "core"."processed_events" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"processed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."role_grant" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"role_key" text NOT NULL,
	"scope_type" text NOT NULL,
	"scope_id" uuid,
	"granted_by" uuid NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"valid_from" timestamp DEFAULT now() NOT NULL,
	"valid_until" timestamp
);
--> statement-breakpoint
CREATE TABLE "core"."role_permission" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"role_key" text NOT NULL,
	"permission_key" text NOT NULL,
	"is_locked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."tenant" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"plan_tier" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "core"."user_identity" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"email" text NOT NULL,
	"sso_subject" text NOT NULL,
	"provider" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"last_login_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."visibility_scope" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications"."notification" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"recipient_id" uuid NOT NULL,
	"sender_id" uuid,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"resource_type" text,
	"resource_id" uuid,
	"resource_url" text,
	"read_at" timestamp,
	"archived_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications"."notification_preference" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"category" text NOT NULL,
	"in_app" boolean DEFAULT true NOT NULL,
	"email" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people"."profile_change_request" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employment_id" uuid NOT NULL,
	"batch_id" uuid,
	"field_path" text NOT NULL,
	"old_value" jsonb,
	"new_value" jsonb NOT NULL,
	"effective_date" date,
	"status" text NOT NULL,
	"requested_by" uuid NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp,
	"review_note" text,
	"decision_case_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people"."completeness_rule" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"field_path" text NOT NULL,
	"weight" integer NOT NULL,
	"is_required" boolean NOT NULL,
	"country_code" text,
	"employment_type" text,
	"deadline_days" integer,
	"label" text NOT NULL,
	"section" text NOT NULL,
	"sort_order" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people"."document_requirement" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"country_code" text NOT NULL,
	"employment_type" text,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"is_required" boolean NOT NULL,
	"deadline_days" integer,
	"sort_order" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people"."employee_document" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employment_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"category" text NOT NULL,
	"subcategory" text,
	"title" text NOT NULL,
	"expiry_date" date,
	"is_confidential" boolean NOT NULL,
	"requires_acknowledgment" boolean NOT NULL,
	"acknowledged_at" timestamp,
	"acknowledged_by" uuid,
	"version" integer NOT NULL,
	"parent_document_id" uuid,
	"status" text NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people"."country_field_config" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"country_code" text NOT NULL,
	"field_key" text NOT NULL,
	"label" text NOT NULL,
	"label_locale" jsonb,
	"field_type" text NOT NULL,
	"field_group" text NOT NULL,
	"is_required" boolean NOT NULL,
	"sort_order" integer NOT NULL,
	"validation" jsonb,
	"options" jsonb
);
--> statement-breakpoint
CREATE TABLE "people"."custom_field_definition" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"field_key" text NOT NULL,
	"label" text NOT NULL,
	"field_type" text NOT NULL,
	"field_group" text,
	"is_required" boolean NOT NULL,
	"is_searchable" boolean NOT NULL,
	"is_filterable" boolean NOT NULL,
	"sort_order" integer NOT NULL,
	"validation" jsonb,
	"options" jsonb,
	"visibility_tier" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people"."field_edit_policy" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"field_path" text NOT NULL,
	"edit_mode" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people"."field_visibility_config" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"field_path" text NOT NULL,
	"visibility_tier" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people"."bulk_operation" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"operation_type" text NOT NULL,
	"employment_ids" uuid[] NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"total_count" integer NOT NULL,
	"success_count" integer DEFAULT 0 NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"errors" jsonb,
	"requested_by" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "people"."contract_policy" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"country_code" text NOT NULL,
	"max_fixed_term_months" integer,
	"max_fixed_term_renewals" integer,
	"force_indefinite_after" boolean DEFAULT false NOT NULL,
	"probation_requires_contract" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people"."contract_version" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employment_id" uuid NOT NULL,
	"contract_type" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"status" text DEFAULT 'draft' NOT NULL,
	"probation_end_date" date,
	"notice_period_days" integer,
	"work_hours_per_week" numeric,
	"base_salary" numeric,
	"salary_currency" text,
	"salary_frequency" text,
	"document_id" uuid,
	"note" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"signed_at" timestamp,
	"signed_by" uuid
);
--> statement-breakpoint
CREATE TABLE "people"."directory_search_index" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employment_id" uuid NOT NULL,
	"full_name" text NOT NULL,
	"full_name_unaccented" text NOT NULL,
	"company_email" text,
	"job_title" text,
	"job_level" text,
	"department_name" text,
	"location_name" text,
	"manager_name" text,
	"work_arrangement" text NOT NULL,
	"employment_status" text NOT NULL,
	"hire_date" date,
	"skills" text[],
	"country_code" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people"."email_generation_config" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"domain" text NOT NULL,
	"pattern" text NOT NULL,
	"transliteration" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people"."employment" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"person_profile_id" uuid NOT NULL,
	"employee_code" text,
	"company_email" text,
	"worker_type" text NOT NULL,
	"employment_type" text NOT NULL,
	"country_code" text,
	"employment_status" text DEFAULT 'pre_hire' NOT NULL,
	"termination_date" date,
	"termination_reason" text,
	"hire_date" date NOT NULL,
	"original_hire_date" date,
	"previous_profile_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people"."employment_detail" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employment_id" uuid NOT NULL,
	"national_id" text,
	"national_id_type" text,
	"national_id_issued_date" date,
	"national_id_expiry_date" date,
	"tax_id" text,
	"social_insurance_id" text,
	"passport_number" text,
	"passport_expiry_date" date,
	"bank_account_number" text,
	"bank_name" text,
	"bank_branch" text,
	"bank_account_holder" text,
	"bank_swift_code" text,
	"personal_email" text,
	"personal_phone" text,
	"permanent_address" jsonb,
	"current_address" jsonb,
	"emergency_contacts" jsonb,
	"country_data" jsonb,
	"custom_fields" jsonb,
	"office_location" text,
	"work_phone" text
);
--> statement-breakpoint
CREATE TABLE "people"."import_job" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"file_document_id" uuid NOT NULL,
	"file_name" text NOT NULL,
	"row_count" integer NOT NULL,
	"column_mapping" jsonb,
	"mapping_profile" text,
	"status" text DEFAULT 'uploaded' NOT NULL,
	"valid_count" integer,
	"error_count" integer,
	"warning_count" integer,
	"validation_report" jsonb,
	"created_count" integer,
	"updated_count" integer,
	"skipped_count" integer,
	"error_details" jsonb,
	"requested_by" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "people"."job_assignment" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employment_id" uuid NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"job_profile_id" uuid,
	"department_id" uuid,
	"location_id" uuid,
	"cost_center_id" uuid,
	"work_arrangement" text DEFAULT 'onsite' NOT NULL,
	"manager_id" uuid,
	"event_type" text NOT NULL,
	"reason" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people"."job_family" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"parent_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people"."job_history" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"job_title" text,
	"department_id" uuid,
	"manager_profile_id" uuid,
	"change_type" text NOT NULL,
	"change_reason" text,
	"recorded_at" timestamp DEFAULT now() NOT NULL,
	"recorded_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people"."job_profile" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"job_family_id" uuid,
	"title" text NOT NULL,
	"level" text,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people"."ms_profile_sync_state" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"delta_token" text,
	"last_synced_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ms_profile_sync_state_tenant_id_unique" UNIQUE("tenant_id")
);
--> statement-breakpoint
CREATE TABLE "people"."ms_staged_user" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"ms_external_id" text NOT NULL,
	"display_name" text NOT NULL,
	"email" text,
	"job_title" text,
	"department" text,
	"office_location" text,
	"mobile_phone" text,
	"work_phone" text,
	"manager_ms_id" text,
	"photo_document_id" uuid,
	"status" text NOT NULL,
	"imported_employment_id" uuid,
	"last_seen_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people"."offboarding_case" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employment_id" uuid NOT NULL,
	"template_id" uuid,
	"reason" text NOT NULL,
	"reason_category" text,
	"decision_case_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people"."offboarding_task" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"assignee_role" text NOT NULL,
	"assignee_actor_id" uuid,
	"due_date" timestamp,
	"is_required" boolean DEFAULT true NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"completed_at" timestamp,
	"evidence_url" text
);
--> statement-breakpoint
CREATE TABLE "people"."offboarding_task_template" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"assignee_role" text NOT NULL,
	"due_days_before_last_day" integer DEFAULT 0 NOT NULL,
	"is_required" boolean DEFAULT true NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people"."offboarding_template" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"employment_type" text,
	"reason_category" text,
	"country_code" text,
	"termination_reason" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people"."onboarding_case" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employment_id" uuid NOT NULL,
	"template_id" uuid,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people"."onboarding_task" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"assignee_role" text NOT NULL,
	"assignee_actor_id" uuid,
	"due_date" timestamp,
	"is_required" boolean DEFAULT true NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"completed_at" timestamp,
	"evidence_url" text
);
--> statement-breakpoint
CREATE TABLE "people"."onboarding_task_template" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"assignee_role" text NOT NULL,
	"due_days_after_hire" integer DEFAULT 0 NOT NULL,
	"is_required" boolean DEFAULT true NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"document_requirement_id" uuid
);
--> statement-breakpoint
CREATE TABLE "people"."onboarding_template" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"country_code" text,
	"worker_type" text,
	"employment_type" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people"."person_profile" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"family_name" text,
	"middle_name" text,
	"given_name" text,
	"full_name" text,
	"full_name_unaccented" text,
	"preferred_name" text,
	"name_display_order" text DEFAULT 'given_first' NOT NULL,
	"date_of_birth" date,
	"gender" text,
	"nationality" text,
	"marital_status" text,
	"photo_document_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people"."probation_policy" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"country_code" text NOT NULL,
	"job_level_category" text NOT NULL,
	"default_duration_days" integer NOT NULL,
	"max_duration_days" integer NOT NULL,
	"allow_extension" boolean NOT NULL,
	"max_extensions" integer DEFAULT 0 NOT NULL,
	"extension_days" integer,
	"min_salary_percentage" numeric DEFAULT '100' NOT NULL,
	"auto_confirm" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people"."probation_record" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employment_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"original_end_date" date NOT NULL,
	"current_end_date" date NOT NULL,
	"extension_count" integer DEFAULT 0 NOT NULL,
	"status" text NOT NULL,
	"outcome_date" date,
	"outcome_by" uuid,
	"outcome_note" text,
	"probation_policy_id" uuid NOT NULL,
	"salary_percentage" numeric NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people"."profile_section" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"section_type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people"."profile_share_link" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employment_id" uuid NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"max_views" integer,
	"view_count" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"revoked_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "planner"."ms_linked_group" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"ms_group_id" text NOT NULL,
	"display_name" text NOT NULL,
	"linked_by_actor_id" uuid NOT NULL,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sync_enabled" boolean DEFAULT true NOT NULL,
	"backfilling_at" timestamp with time zone,
	"backfill_job_id" text,
	"unlinked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "planner"."ms_plan_sync_state" (
	"plan_id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"ms_plan_id" text NOT NULL,
	"ms_plan_etag" text,
	"last_polled_at" timestamp with time zone,
	"last_successful_poll_at" timestamp with time zone,
	"consecutive_error_count" integer DEFAULT 0 NOT NULL,
	"last_error_code" text,
	"last_error_message" text,
	"poll_paused_until" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "planner"."ms_sync_conflict" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"task_id" uuid,
	"plan_id" uuid,
	"field" text,
	"mine_value" jsonb,
	"theirs_value" jsonb,
	"mine_changed_at" timestamp with time zone,
	"theirs_changed_at" timestamp with time zone,
	"resolution" text,
	"resolved_by_actor_id" uuid,
	"resolved_at" timestamp with time zone,
	"raw_error" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "planner"."bucket" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"name" text NOT NULL,
	"order_hint" text NOT NULL,
	"ms_bucket_id" text,
	"ms_bucket_etag" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "planner"."my_day_entry" (
	"actor_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"added_date" date NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"tenant_id" uuid NOT NULL,
	CONSTRAINT "my_day_entry_actor_id_task_id_added_date_pk" PRIMARY KEY("actor_id","task_id","added_date")
);
--> statement-breakpoint
CREATE TABLE "planner"."plan" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"container_type" text,
	"container_ref" text,
	"ms_group_id" text,
	"ms_roster_id" text,
	"ms_plan_id" text,
	"ms_plan_etag" text,
	"is_ms_archived" boolean DEFAULT false NOT NULL,
	"owner_actor_id" uuid,
	"sync_enabled" boolean DEFAULT true NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "chk_plan_description_length" CHECK (char_length("planner"."plan"."description") <= 32000),
	CONSTRAINT "chk_plan_container_xor" CHECK (("planner"."plan"."container_type" IS NULL AND "planner"."plan"."container_ref" IS NULL)
        OR ("planner"."plan"."container_type" = 'future_only' AND "planner"."plan"."container_ref" IS NULL)
        OR ("planner"."plan"."container_type" = 'ms_group' AND "planner"."plan"."container_ref" IS NOT NULL)
        OR ("planner"."plan"."container_type" = 'ms_roster' AND "planner"."plan"."container_ref" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "planner"."plan_label" (
	"plan_id" uuid NOT NULL,
	"slot" text NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"tenant_id" uuid NOT NULL,
	CONSTRAINT "plan_label_plan_id_slot_pk" PRIMARY KEY("plan_id","slot"),
	CONSTRAINT "chk_plan_label_slot" CHECK ("planner"."plan_label"."slot" ~ '^category([1-9]|1[0-9]|2[0-5])$')
);
--> statement-breakpoint
CREATE TABLE "planner"."plan_member" (
	"plan_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"role" text NOT NULL,
	"added_by" uuid NOT NULL,
	"added_at" timestamp DEFAULT now() NOT NULL,
	"tenant_id" uuid NOT NULL,
	CONSTRAINT "plan_member_plan_id_actor_id_pk" PRIMARY KEY("plan_id","actor_id")
);
--> statement-breakpoint
CREATE TABLE "planner"."task" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"bucket_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"progress" smallint DEFAULT 0 NOT NULL,
	"priority" smallint DEFAULT 5 NOT NULL,
	"start_date" date,
	"due_date" date,
	"order_hint" text NOT NULL,
	"cover_attachment_id" uuid,
	"checklist_item_count" smallint DEFAULT 0 NOT NULL,
	"checklist_checked_count" smallint DEFAULT 0 NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"completed_by" uuid,
	"completed_at" timestamp,
	"deleted_at" timestamp,
	"ms_task_id" text,
	"ms_task_etag" text,
	"ms_task_details_etag" text,
	"ms_soft_deleted_at" timestamp with time zone,
	"ms_sync_pushed_at" timestamp with time zone,
	"pending_ms_assignments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "chk_task_progress" CHECK ("planner"."task"."progress" IN (0, 50, 100)),
	CONSTRAINT "chk_task_priority" CHECK ("planner"."task"."priority" IN (1, 3, 5, 9)),
	CONSTRAINT "chk_task_description_length" CHECK (char_length("planner"."task"."description") <= 32000),
	CONSTRAINT "chk_task_completion_consistency" CHECK (("planner"."task"."progress" = 100 AND "planner"."task"."completed_at" IS NOT NULL) OR ("planner"."task"."progress" < 100 AND "planner"."task"."completed_at" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "planner"."task_applied_label" (
	"task_id" uuid NOT NULL,
	"slot" text NOT NULL,
	"tenant_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	CONSTRAINT "task_applied_label_task_id_slot_pk" PRIMARY KEY("task_id","slot")
);
--> statement-breakpoint
CREATE TABLE "planner"."task_assignee" (
	"task_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"assigned_by" uuid NOT NULL,
	"assigned_at" timestamp DEFAULT now() NOT NULL,
	"tenant_id" uuid NOT NULL,
	CONSTRAINT "task_assignee_task_id_actor_id_pk" PRIMARY KEY("task_id","actor_id")
);
--> statement-breakpoint
CREATE TABLE "planner"."task_attachment" (
	"id" uuid PRIMARY KEY NOT NULL,
	"task_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"storage_key" text,
	"size_bytes" bigint,
	"content_type" text,
	"filename" text,
	"url" text,
	"link_title" text,
	"preview_type" text,
	"tenant_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "chk_task_attachment_kind_xor" CHECK (("planner"."task_attachment"."kind" = 'file' AND "planner"."task_attachment"."storage_key" IS NOT NULL AND "planner"."task_attachment"."url" IS NULL)
        OR ("planner"."task_attachment"."kind" = 'link' AND "planner"."task_attachment"."url" IS NOT NULL AND "planner"."task_attachment"."storage_key" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "planner"."task_checklist_item" (
	"id" uuid PRIMARY KEY NOT NULL,
	"task_id" uuid NOT NULL,
	"title" text NOT NULL,
	"is_checked" boolean DEFAULT false NOT NULL,
	"order_hint" text NOT NULL,
	"tenant_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "planner"."task_comment" (
	"id" uuid PRIMARY KEY NOT NULL,
	"task_id" uuid NOT NULL,
	"author_actor_id" uuid NOT NULL,
	"body" text NOT NULL,
	"posted_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"tenant_id" uuid NOT NULL,
	"ms_thread_id" text,
	"ms_post_id" text,
	"ms_post_etag" text,
	CONSTRAINT "chk_task_comment_body_length" CHECK (char_length("planner"."task_comment"."body") <= 4000)
);
--> statement-breakpoint
CREATE TABLE "planner"."task_evidence" (
	"id" uuid PRIMARY KEY NOT NULL,
	"task_id" uuid NOT NULL,
	"submitted_by" uuid NOT NULL,
	"submitted_at" timestamp DEFAULT now() NOT NULL,
	"kind" text NOT NULL,
	"storage_key" text,
	"size_bytes" bigint,
	"content_type" text,
	"filename" text,
	"url" text,
	"link_title" text,
	"body" text,
	"caption" text DEFAULT '' NOT NULL,
	"verified_by" uuid,
	"verified_at" timestamp,
	"verification_note" text,
	"tenant_id" uuid NOT NULL,
	CONSTRAINT "chk_task_evidence_kind_xor" CHECK (("planner"."task_evidence"."kind" = 'file' AND "planner"."task_evidence"."storage_key" IS NOT NULL)
        OR ("planner"."task_evidence"."kind" = 'link' AND "planner"."task_evidence"."url" IS NOT NULL)
        OR ("planner"."task_evidence"."kind" = 'note' AND "planner"."task_evidence"."body" IS NOT NULL)),
	CONSTRAINT "chk_task_evidence_caption_length" CHECK (char_length("planner"."task_evidence"."caption") <= 500),
	CONSTRAINT "chk_task_evidence_body_length" CHECK ("planner"."task_evidence"."body" IS NULL OR char_length("planner"."task_evidence"."body") <= 4000),
	CONSTRAINT "chk_task_evidence_verification_consistency" CHECK (("planner"."task_evidence"."verified_by" IS NULL AND "planner"."task_evidence"."verified_at" IS NULL) OR ("planner"."task_evidence"."verified_by" IS NOT NULL AND "planner"."task_evidence"."verified_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "planner"."task_daily_snapshot" (
	"tenant_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"snapshot_date" date NOT NULL,
	"total_count" integer NOT NULL,
	"open_count" integer NOT NULL,
	"completed_count" integer NOT NULL,
	"by_priority" jsonb NOT NULL,
	"by_bucket" jsonb NOT NULL,
	"by_assignee" jsonb NOT NULL,
	"completed_in_day" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_daily_snapshot_tenant_id_plan_id_snapshot_date_pk" PRIMARY KEY("tenant_id","plan_id","snapshot_date")
);
--> statement-breakpoint
CREATE TABLE "preferences"."saved_view" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"resource_key" text NOT NULL,
	"name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"state_json" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects"."account" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"client_company" text,
	"description" text,
	"domain" text,
	"location" text,
	"timezone" text,
	"billing_model" text,
	"status" text DEFAULT 'active' NOT NULL,
	"account_manager_id" uuid,
	"started_at" timestamp,
	"ended_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects"."allocation" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"project_role_id" uuid NOT NULL,
	"actor_id" uuid,
	"position" text,
	"hours_per_day" numeric(4, 2) NOT NULL,
	"billing_type" text NOT NULL,
	"member_type" text DEFAULT 'core' NOT NULL,
	"status" text DEFAULT 'tentative' NOT NULL,
	"started_at" timestamp NOT NULL,
	"ended_at" timestamp,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects"."project" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"name" text NOT NULL,
	"code" text,
	"description" text,
	"delivery_model" text,
	"status" text DEFAULT 'active' NOT NULL,
	"started_at" timestamp,
	"ended_at" timestamp,
	"tags" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects"."project_role" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"role_name" text NOT NULL,
	"skills_required" text[],
	"headcount" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "planner"."bucket" ADD CONSTRAINT "bucket_plan_id_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "planner"."plan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planner"."plan_label" ADD CONSTRAINT "plan_label_plan_id_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "planner"."plan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planner"."plan_member" ADD CONSTRAINT "plan_member_plan_id_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "planner"."plan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planner"."task" ADD CONSTRAINT "task_plan_id_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "planner"."plan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planner"."task" ADD CONSTRAINT "task_bucket_id_bucket_id_fk" FOREIGN KEY ("bucket_id") REFERENCES "planner"."bucket"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planner"."task_applied_label" ADD CONSTRAINT "task_applied_label_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "planner"."task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planner"."task_assignee" ADD CONSTRAINT "task_assignee_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "planner"."task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planner"."task_attachment" ADD CONSTRAINT "task_attachment_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "planner"."task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planner"."task_checklist_item" ADD CONSTRAINT "task_checklist_item_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "planner"."task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planner"."task_comment" ADD CONSTRAINT "task_comment_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "planner"."task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planner"."task_evidence" ADD CONSTRAINT "task_evidence_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "planner"."task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_module_toggle_tenant_module_idx" ON "admin"."tenant_module_toggle" USING btree ("tenant_id","module_key");--> statement-breakpoint
CREATE INDEX "agent_draft_tenant_status_expires_idx" ON "agents"."agent_draft" USING btree ("tenant_id","status","expires_at");--> statement-breakpoint
CREATE INDEX "agent_draft_tenant_approver_status_idx" ON "agents"."agent_draft" USING btree ("tenant_id","approver_user_id","status");--> statement-breakpoint
CREATE INDEX "agent_draft_trace_idx" ON "agents"."agent_draft" USING btree ("trace_id");--> statement-breakpoint
CREATE INDEX "idx_agent_iteration_turn" ON "agents"."agent_iteration" USING btree ("turn_id","iteration_number");--> statement-breakpoint
CREATE INDEX "agent_cost_reconciliation_week_start_idx" ON "agents"."agent_cost_reconciliation" USING btree ("week_start");--> statement-breakpoint
CREATE INDEX "agent_p1_incident_log_severity_opened_idx" ON "agents"."agent_p1_incident_log" USING btree ("severity","opened_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "agent_readiness_check_criterion_window_idx" ON "agents"."agent_readiness_check" USING btree ("criterion_id","window_end" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "agent_runbook_dry_run_runbook_executed_idx" ON "agents"."agent_runbook_dry_run" USING btree ("runbook_id","executed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "agent_runbook_dry_run_tenant_executed_idx" ON "agents"."agent_runbook_dry_run" USING btree ("tenant_id","executed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "agent_schedule_run_schedule_started_idx" ON "agents"."agent_schedule_run" USING btree ("schedule_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "agent_schedule_run_tenant_trace_idx" ON "agents"."agent_schedule_run" USING btree ("tenant_id","trace_id");--> statement-breakpoint
CREATE INDEX "agent_schedule_tenant_status_trigger_idx" ON "agents"."agent_schedule" USING btree ("tenant_id","status","trigger_kind");--> statement-breakpoint
CREATE INDEX "agent_schedule_tenant_owner_status_idx" ON "agents"."agent_schedule" USING btree ("tenant_id","owner_user_id","status");--> statement-breakpoint
CREATE INDEX "agent_schedule_tenant_delegation_idx" ON "agents"."agent_schedule" USING btree ("tenant_id","delegation_id");--> statement-breakpoint
CREATE INDEX "agent_semantic_index_tenant_user_idx" ON "agents"."agent_semantic_index" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE INDEX "agent_semantic_index_tenant_user_subagent_idx" ON "agents"."agent_semantic_index" USING btree ("tenant_id","user_id","sub_agent_id");--> statement-breakpoint
CREATE INDEX "agent_semantic_index_source_idx" ON "agents"."agent_semantic_index" USING btree ("tenant_id","source_id");--> statement-breakpoint
CREATE INDEX "agent_tool_embedding_tool_name_idx" ON "agents"."agent_tool_embedding" USING btree ("tool_name");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_tool_result_cache_exact_uidx" ON "agents"."agent_tool_result_cache" USING btree ("tenant_id","tool_name","canonical_args_hash");--> statement-breakpoint
CREATE INDEX "agent_tool_result_cache_tenant_tool_idx" ON "agents"."agent_tool_result_cache" USING btree ("tenant_id","tool_name");--> statement-breakpoint
CREATE INDEX "agent_active_turn_tenant_started_idx" ON "agents"."agent_active_turn" USING btree ("tenant_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "agent_active_turn_heartbeat_idx" ON "agents"."agent_active_turn" USING btree ("last_heartbeat_at");--> statement-breakpoint
CREATE INDEX "agent_canary_query_tier_status_idx" ON "agents"."agent_canary_query" USING btree ("tier","status");--> statement-breakpoint
CREATE INDEX "agent_canary_query_tenant_quarter_idx" ON "agents"."agent_canary_query" USING btree ("tenant_id","rotation_quarter");--> statement-breakpoint
CREATE INDEX "agent_canary_run_tier_run_at_idx" ON "agents"."agent_canary_run" USING btree ("tier","run_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "agent_message_tenant_user_conv_created_idx" ON "agents"."agent_message" USING btree ("tenant_id","user_id","conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_message_fts_idx" ON "agents"."agent_message" USING gin (to_tsvector('simple', CASE WHEN "role" = 'user' THEN coalesce("content"->>'text','') ELSE '' END || ' ' || coalesce("summary",'')));--> statement-breakpoint
CREATE UNIQUE INDEX "agent_conversation_scope_active_uidx" ON "agents"."agent_conversation" USING btree ("tenant_id","user_id","surface") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "agent_conversation_tenant_user_status_updated_idx" ON "agents"."agent_conversation" USING btree ("tenant_id","user_id","status","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "agent_cost_event_tenant_created_idx" ON "agents"."agent_cost_event" USING btree ("tenant_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "agent_cost_event_tenant_user_created_idx" ON "agents"."agent_cost_event" USING btree ("tenant_id","user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "agent_cost_event_tenant_schedule_idx" ON "agents"."agent_cost_event" USING btree ("tenant_id","via_schedule_id");--> statement-breakpoint
CREATE INDEX "agent_golden_trace_tenant_active_idx" ON "agents"."agent_golden_trace" USING btree ("tenant_id") WHERE removed_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_pricing_model_effective_from_uidx" ON "agents"."agent_pricing" USING btree ("model_id","effective_from");--> statement-breakpoint
CREATE INDEX "agent_rate_limit_counter_lookup_idx" ON "agents"."agent_rate_limit_counter" USING btree ("tenant_id","user_id","limit_key","bucket");--> statement-breakpoint
CREATE INDEX "agent_rollout_config_tenant_status_class_idx" ON "agents"."agent_rollout_config" USING btree ("tenant_id","status","change_class");--> statement-breakpoint
CREATE INDEX "agent_rollout_event_config_ts_idx" ON "agents"."agent_rollout_event" USING btree ("rollout_config_id","ts" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "agent_rollout_event_tenant_ts_idx" ON "agents"."agent_rollout_event" USING btree ("tenant_id","ts" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "agent_session_conversation_lookup_idx" ON "agents"."agent_session" USING btree ("tenant_id","user_id","conversation_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "agent_session_conversation_active_uq" ON "agents"."agent_session" USING btree ("tenant_id","conversation_id") WHERE ended_at IS NULL;--> statement-breakpoint
CREATE INDEX "agent_shadow_run_config_ts_idx" ON "agents"."agent_shadow_run" USING btree ("rollout_config_id","ts" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "agent_shadow_run_tenant_ts_idx" ON "agents"."agent_shadow_run" USING btree ("tenant_id","ts" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "agent_stored_sub_agent_tenant_key_version_uidx" ON "agents"."agent_stored_sub_agent" USING btree ("tenant_id","key","version");--> statement-breakpoint
CREATE INDEX "agent_stored_sub_agent_tenant_key_status_idx" ON "agents"."agent_stored_sub_agent" USING btree ("tenant_id","key","status");--> statement-breakpoint
CREATE INDEX "agent_stored_sub_agent_tenant_key_version_desc_idx" ON "agents"."agent_stored_sub_agent" USING btree ("tenant_id","key","version" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "agent_tool_invocation_trace_idx" ON "agents"."agent_tool_invocation" USING btree ("trace_id");--> statement-breakpoint
CREATE INDEX "agent_tool_invocation_tenant_user_tool_created_idx" ON "agents"."agent_tool_invocation" USING btree ("tenant_id","user_id","tool_name","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "agent_turn_sampling_decision_tenant_created_idx" ON "agents"."agent_turn_sampling_decision" USING btree ("tenant_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "uq_identity_provider_tenant_primary" ON "identity"."identity_provider" USING btree ("tenant_id","is_primary") WHERE "identity"."identity_provider"."is_primary" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_idp_group_mapping_role_scope_scoped" ON "identity"."idp_group_mapping" USING btree ("tenant_id","external_group_id","role_key","scope_type","scope_id") WHERE "identity"."idp_group_mapping"."scope_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_idp_group_mapping_role_scope_global" ON "identity"."idp_group_mapping" USING btree ("tenant_id","external_group_id","role_key","scope_type") WHERE "identity"."idp_group_mapping"."scope_id" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_idp_group_member_lookup" ON "identity"."idp_group_member" USING btree ("tenant_id","external_group_id");--> statement-breakpoint
CREATE INDEX "idx_magic_link_token_hash_unused" ON "identity"."magic_link_token" USING btree ("token_hash") WHERE "identity"."magic_link_token"."used_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_authorization_session_state_uidx" ON "identity"."oauth_authorization_session" USING btree ("state_hash");--> statement-breakpoint
CREATE INDEX "oauth_authorization_session_tenant_idx" ON "identity"."oauth_authorization_session" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_sync_history_tenant_started" ON "identity"."sync_history" USING btree ("tenant_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_domain_domain_uidx" ON "identity"."tenant_domain" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "agent_delegation_tenant_delegator_status_idx" ON "core"."agent_delegation" USING btree ("tenant_id","delegator_user_id","status");--> statement-breakpoint
CREATE INDEX "agent_delegation_tenant_status_expires_idx" ON "core"."agent_delegation" USING btree ("tenant_id","status","expires_at");--> statement-breakpoint
CREATE INDEX "audit_event_flow_id_idx" ON "core"."audit_event" USING btree ("flow_id");--> statement-breakpoint
CREATE INDEX "audit_event_intent_slug_idx" ON "core"."audit_event" USING btree ("intent_slug");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_role_permission_tenant_role_perm" ON "core"."role_permission" USING btree ("tenant_id","role_key","permission_key");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_user_identity_tenant_sso_subject" ON "core"."user_identity" USING btree ("tenant_id","sso_subject");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_notification_preference" ON "notifications"."notification_preference" USING btree ("tenant_id","actor_id","category");--> statement-breakpoint
CREATE UNIQUE INDEX "country_field_config_country_key_uidx" ON "people"."country_field_config" USING btree ("tenant_id","country_code","field_key");--> statement-breakpoint
CREATE UNIQUE INDEX "custom_field_definition_tenant_key_uidx" ON "people"."custom_field_definition" USING btree ("tenant_id","field_key");--> statement-breakpoint
CREATE UNIQUE INDEX "field_edit_policy_tenant_path_uidx" ON "people"."field_edit_policy" USING btree ("tenant_id","field_path");--> statement-breakpoint
CREATE UNIQUE INDEX "field_visibility_config_tenant_path_uidx" ON "people"."field_visibility_config" USING btree ("tenant_id","field_path");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_directory_search_index_employment" ON "people"."directory_search_index" USING btree ("tenant_id","employment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "employment_detail_tenant_employment_uidx" ON "people"."employment_detail" USING btree ("tenant_id","employment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "job_history_tenant_profile_from_uidx" ON "people"."job_history" USING btree ("tenant_id","profile_id","effective_from");--> statement-breakpoint
CREATE UNIQUE INDEX "ms_staged_user_tenant_external_uidx" ON "people"."ms_staged_user" USING btree ("tenant_id","ms_external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "person_profile_tenant_actor_uidx" ON "people"."person_profile" USING btree ("tenant_id","actor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_ms_linked_group_tenant_msgroup" ON "planner"."ms_linked_group" USING btree ("tenant_id","ms_group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_ms_plan_sync_state_tenant_msplan" ON "planner"."ms_plan_sync_state" USING btree ("tenant_id","ms_plan_id");--> statement-breakpoint
CREATE INDEX "idx_ms_sync_conflict_tenant" ON "planner"."ms_sync_conflict" USING btree ("tenant_id","resolved_at","created_at");--> statement-breakpoint
CREATE INDEX "idx_bucket_plan_deleted_order" ON "planner"."bucket" USING btree ("plan_id","deleted_at","order_hint") WHERE "planner"."bucket"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_bucket_tenant_ms_bucket_id" ON "planner"."bucket" USING btree ("tenant_id","ms_bucket_id") WHERE "planner"."bucket"."ms_bucket_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_my_day_entry_today" ON "planner"."my_day_entry" USING btree ("tenant_id","actor_id","added_date");--> statement-breakpoint
CREATE INDEX "idx_my_day_entry_task" ON "planner"."my_day_entry" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "idx_plan_tenant_deleted" ON "planner"."plan" USING btree ("tenant_id","deleted_at") WHERE "planner"."plan"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_plan_tenant_created_by" ON "planner"."plan" USING btree ("tenant_id","created_by");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_plan_tenant_ms_plan_id" ON "planner"."plan" USING btree ("tenant_id","ms_plan_id") WHERE "planner"."plan"."ms_plan_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_plan_tenant_owner_actor" ON "planner"."plan" USING btree ("tenant_id","owner_actor_id") WHERE "planner"."plan"."owner_actor_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_plan_member_tenant_actor" ON "planner"."plan_member" USING btree ("tenant_id","actor_id");--> statement-breakpoint
CREATE INDEX "idx_task_tenant_plan_bucket_deleted_order" ON "planner"."task" USING btree ("tenant_id","plan_id","bucket_id","deleted_at","order_hint") WHERE "planner"."task"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_task_tenant_due_date" ON "planner"."task" USING btree ("tenant_id","due_date") WHERE "planner"."task"."deleted_at" IS NULL AND "planner"."task"."progress" < 100;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_task_tenant_ms_task_id" ON "planner"."task" USING btree ("tenant_id","ms_task_id") WHERE "planner"."task"."ms_task_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_task_applied_label_tenant_plan_slot" ON "planner"."task_applied_label" USING btree ("tenant_id","plan_id","slot");--> statement-breakpoint
CREATE INDEX "idx_task_assignee_tenant_actor" ON "planner"."task_assignee" USING btree ("tenant_id","actor_id");--> statement-breakpoint
CREATE INDEX "idx_task_attachment_task" ON "planner"."task_attachment" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "idx_task_checklist_item_task_order" ON "planner"."task_checklist_item" USING btree ("task_id","order_hint");--> statement-breakpoint
CREATE INDEX "idx_task_comment_task_posted" ON "planner"."task_comment" USING btree ("task_id","posted_at") WHERE "planner"."task_comment"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_task_evidence_task_submitted" ON "planner"."task_evidence" USING btree ("task_id","submitted_at");--> statement-breakpoint
CREATE INDEX "idx_task_evidence_tenant_submitted_by" ON "planner"."task_evidence" USING btree ("tenant_id","submitted_by");--> statement-breakpoint
CREATE INDEX "saved_view_tenant_actor_resource_idx" ON "preferences"."saved_view" USING btree ("tenant_id","actor_id","resource_key");--> statement-breakpoint
CREATE UNIQUE INDEX "saved_view_unique_default_idx" ON "preferences"."saved_view" USING btree ("tenant_id","actor_id","resource_key") WHERE is_default = true;
-- BEGIN RLS DDL (generated by packages/db/src/append-rls.ts) — DO NOT EDIT
-- Generated by packages/db/src/append-rls.ts — do not edit manually.

-- agents.agent_chat_session
ALTER TABLE agents.agent_chat_session ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents.agent_chat_session FORCE ROW LEVEL SECURITY;
CREATE POLICY agent_chat_session_tenant_isolation
  ON agents.agent_chat_session
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- agents.agent_chat_message
ALTER TABLE agents.agent_chat_message ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents.agent_chat_message FORCE ROW LEVEL SECURITY;
CREATE POLICY agent_chat_message_tenant_isolation
  ON agents.agent_chat_message
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- agents.agent_insight
ALTER TABLE agents.agent_insight ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents.agent_insight FORCE ROW LEVEL SECURITY;
CREATE POLICY agent_insight_tenant_isolation
  ON agents.agent_insight
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- agents.agent_prompt_store
ALTER TABLE agents.agent_prompt_store ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents.agent_prompt_store FORCE ROW LEVEL SECURITY;
CREATE POLICY agent_prompt_store_tenant_isolation
  ON agents.agent_prompt_store
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- agents.agent_narrative_store
ALTER TABLE agents.agent_narrative_store ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents.agent_narrative_store FORCE ROW LEVEL SECURITY;
CREATE POLICY agent_narrative_store_tenant_isolation
  ON agents.agent_narrative_store
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- agents.agent_session
ALTER TABLE agents.agent_session ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents.agent_session FORCE ROW LEVEL SECURITY;
CREATE POLICY agent_session_tenant_isolation
  ON agents.agent_session
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- agents.agent_stored_sub_agent
ALTER TABLE agents.agent_stored_sub_agent ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents.agent_stored_sub_agent FORCE ROW LEVEL SECURITY;
CREATE POLICY agent_stored_sub_agent_tenant_isolation
  ON agents.agent_stored_sub_agent
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- agents.agent_conversation
ALTER TABLE agents.agent_conversation ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents.agent_conversation FORCE ROW LEVEL SECURITY;
CREATE POLICY agent_conversation_tenant_isolation
  ON agents.agent_conversation
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- agents.agent_message
ALTER TABLE agents.agent_message ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents.agent_message FORCE ROW LEVEL SECURITY;
CREATE POLICY agent_message_tenant_isolation
  ON agents.agent_message
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- agents.agent_l3_preference
ALTER TABLE agents.agent_l3_preference ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents.agent_l3_preference FORCE ROW LEVEL SECURITY;
CREATE POLICY agent_l3_preference_tenant_isolation
  ON agents.agent_l3_preference
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- agents.agent_scratchpad
ALTER TABLE agents.agent_scratchpad ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents.agent_scratchpad FORCE ROW LEVEL SECURITY;
CREATE POLICY agent_scratchpad_tenant_isolation
  ON agents.agent_scratchpad
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- agents.agent_tool_invocation
ALTER TABLE agents.agent_tool_invocation ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents.agent_tool_invocation FORCE ROW LEVEL SECURITY;
CREATE POLICY agent_tool_invocation_tenant_isolation
  ON agents.agent_tool_invocation
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- agents.agent_turn_sampling_decision
ALTER TABLE agents.agent_turn_sampling_decision ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents.agent_turn_sampling_decision FORCE ROW LEVEL SECURITY;
CREATE POLICY agent_turn_sampling_decision_tenant_isolation
  ON agents.agent_turn_sampling_decision
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- agents.agent_cost_event
ALTER TABLE agents.agent_cost_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents.agent_cost_event FORCE ROW LEVEL SECURITY;
CREATE POLICY agent_cost_event_tenant_isolation
  ON agents.agent_cost_event
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- agents.agent_tenant_budget
ALTER TABLE agents.agent_tenant_budget ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents.agent_tenant_budget FORCE ROW LEVEL SECURITY;
CREATE POLICY agent_tenant_budget_tenant_isolation
  ON agents.agent_tenant_budget
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- agents.agent_user_budget
ALTER TABLE agents.agent_user_budget ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents.agent_user_budget FORCE ROW LEVEL SECURITY;
CREATE POLICY agent_user_budget_tenant_isolation
  ON agents.agent_user_budget
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- agents.agent_rate_limit_counter
ALTER TABLE agents.agent_rate_limit_counter ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents.agent_rate_limit_counter FORCE ROW LEVEL SECURITY;
CREATE POLICY agent_rate_limit_counter_tenant_isolation
  ON agents.agent_rate_limit_counter
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- agents.agent_active_turn
ALTER TABLE agents.agent_active_turn ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents.agent_active_turn FORCE ROW LEVEL SECURITY;
CREATE POLICY agent_active_turn_tenant_isolation
  ON agents.agent_active_turn
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- agents.agent_golden_trace
ALTER TABLE agents.agent_golden_trace ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents.agent_golden_trace FORCE ROW LEVEL SECURITY;
CREATE POLICY agent_golden_trace_tenant_isolation
  ON agents.agent_golden_trace
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- agents.agent_canary_run
ALTER TABLE agents.agent_canary_run ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents.agent_canary_run FORCE ROW LEVEL SECURITY;
CREATE POLICY agent_canary_run_tenant_isolation
  ON agents.agent_canary_run
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- agents.agent_canary_query
ALTER TABLE agents.agent_canary_query ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents.agent_canary_query FORCE ROW LEVEL SECURITY;
CREATE POLICY agent_canary_query_tenant_isolation
  ON agents.agent_canary_query
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- agents.agent_rollout_config
ALTER TABLE agents.agent_rollout_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents.agent_rollout_config FORCE ROW LEVEL SECURITY;
CREATE POLICY agent_rollout_config_tenant_isolation
  ON agents.agent_rollout_config
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- agents.agent_rollout_event
ALTER TABLE agents.agent_rollout_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents.agent_rollout_event FORCE ROW LEVEL SECURITY;
CREATE POLICY agent_rollout_event_tenant_isolation
  ON agents.agent_rollout_event
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- agents.agent_shadow_run
ALTER TABLE agents.agent_shadow_run ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents.agent_shadow_run FORCE ROW LEVEL SECURITY;
CREATE POLICY agent_shadow_run_tenant_isolation
  ON agents.agent_shadow_run
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- agents.agent_tool_result_cache
ALTER TABLE agents.agent_tool_result_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents.agent_tool_result_cache FORCE ROW LEVEL SECURITY;
CREATE POLICY agent_tool_result_cache_tenant_isolation
  ON agents.agent_tool_result_cache
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- agents.agent_draft
ALTER TABLE agents.agent_draft ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents.agent_draft FORCE ROW LEVEL SECURITY;
CREATE POLICY agent_draft_tenant_isolation
  ON agents.agent_draft
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- agents.agent_iteration
ALTER TABLE agents.agent_iteration ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents.agent_iteration FORCE ROW LEVEL SECURITY;
CREATE POLICY agent_iteration_tenant_isolation
  ON agents.agent_iteration
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- agents.agent_schedule
ALTER TABLE agents.agent_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents.agent_schedule FORCE ROW LEVEL SECURITY;
CREATE POLICY agent_schedule_tenant_isolation
  ON agents.agent_schedule
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- agents.agent_schedule_run
ALTER TABLE agents.agent_schedule_run ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents.agent_schedule_run FORCE ROW LEVEL SECURITY;
CREATE POLICY agent_schedule_run_tenant_isolation
  ON agents.agent_schedule_run
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- agents.agent_runbook_dry_run
ALTER TABLE agents.agent_runbook_dry_run ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents.agent_runbook_dry_run FORCE ROW LEVEL SECURITY;
CREATE POLICY agent_runbook_dry_run_tenant_isolation
  ON agents.agent_runbook_dry_run
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- agents.agent_p1_incident_log
ALTER TABLE agents.agent_p1_incident_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents.agent_p1_incident_log FORCE ROW LEVEL SECURITY;
CREATE POLICY agent_p1_incident_log_tenant_isolation
  ON agents.agent_p1_incident_log
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- agents.agent_semantic_index
ALTER TABLE agents.agent_semantic_index ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents.agent_semantic_index FORCE ROW LEVEL SECURITY;
CREATE POLICY agent_semantic_index_tenant_isolation
  ON agents.agent_semantic_index
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- core.agent_delegation
ALTER TABLE core.agent_delegation ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.agent_delegation FORCE ROW LEVEL SECURITY;
CREATE POLICY agent_delegation_tenant_isolation
  ON core.agent_delegation
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
