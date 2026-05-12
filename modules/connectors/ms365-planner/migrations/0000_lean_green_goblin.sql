CREATE SCHEMA "connector_ms365_planner";
--> statement-breakpoint
CREATE TABLE "connector_ms365_planner"."planner_buckets_cache" (
	"tenant_id" uuid NOT NULL,
	"graph_bucket_id" text NOT NULL,
	"plan_id" text,
	"name" text,
	"order_hint" text,
	"etag" text,
	"raw" jsonb,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"soft_deleted_at" timestamp with time zone,
	CONSTRAINT "planner_buckets_cache_tenant_id_graph_bucket_id_pk" PRIMARY KEY("tenant_id","graph_bucket_id")
);
--> statement-breakpoint
CREATE TABLE "connector_ms365_planner"."planner_plans_cache" (
	"tenant_id" uuid NOT NULL,
	"graph_plan_id" text NOT NULL,
	"owner_group_id" text,
	"title" text,
	"container_url" text,
	"etag" text,
	"raw" jsonb,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"soft_deleted_at" timestamp with time zone,
	CONSTRAINT "planner_plans_cache_tenant_id_graph_plan_id_pk" PRIMARY KEY("tenant_id","graph_plan_id")
);
--> statement-breakpoint
CREATE TABLE "connector_ms365_planner"."planner_task_details_cache" (
	"tenant_id" uuid NOT NULL,
	"graph_task_id" text NOT NULL,
	"description" text,
	"checklist" jsonb,
	"references" jsonb,
	"etag" text,
	"raw" jsonb,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "planner_task_details_cache_tenant_id_graph_task_id_pk" PRIMARY KEY("tenant_id","graph_task_id")
);
--> statement-breakpoint
CREATE TABLE "connector_ms365_planner"."planner_tasks_cache" (
	"tenant_id" uuid NOT NULL,
	"graph_task_id" text NOT NULL,
	"plan_id" text,
	"bucket_id" text,
	"title" text,
	"percent_complete" smallint,
	"priority" smallint,
	"due_date" timestamp with time zone,
	"assignee_ids" text[],
	"created_by" text,
	"created_at_graph" timestamp with time zone,
	"last_modified_by" text,
	"last_modified_at_graph" timestamp with time zone,
	"etag" text,
	"raw" jsonb,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"soft_deleted_at" timestamp with time zone,
	CONSTRAINT "planner_tasks_cache_tenant_id_graph_task_id_pk" PRIMARY KEY("tenant_id","graph_task_id")
);
--> statement-breakpoint
CREATE TABLE "connector_ms365_planner"."sync_watermarks" (
	"tenant_id" uuid NOT NULL,
	"scope_kind" text NOT NULL,
	"scope_id" text NOT NULL,
	"last_sync_at" timestamp with time zone,
	"status" text,
	CONSTRAINT "sync_watermarks_tenant_id_scope_kind_scope_id_pk" PRIMARY KEY("tenant_id","scope_kind","scope_id")
);
--> statement-breakpoint
CREATE INDEX "planner_buckets_by_plan" ON "connector_ms365_planner"."planner_buckets_cache" USING btree ("tenant_id","plan_id");--> statement-breakpoint
CREATE INDEX "planner_tasks_by_plan" ON "connector_ms365_planner"."planner_tasks_cache" USING btree ("tenant_id","plan_id");--> statement-breakpoint
CREATE INDEX "planner_tasks_by_due" ON "connector_ms365_planner"."planner_tasks_cache" USING btree ("tenant_id","due_date");--> statement-breakpoint
CREATE INDEX "planner_tasks_by_assignees" ON "connector_ms365_planner"."planner_tasks_cache" USING gin ("tenant_id","assignee_ids");