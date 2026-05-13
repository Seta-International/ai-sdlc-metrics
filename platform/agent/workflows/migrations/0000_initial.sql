CREATE SCHEMA "agent_workflows";
--> statement-breakpoint
CREATE TABLE "agent_workflows"."workflow_snapshots" (
	"run_id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"workflow_id" text NOT NULL,
	"serialized_step_graph" jsonb NOT NULL,
	"active_paths" jsonb NOT NULL,
	"suspended_paths" jsonb NOT NULL,
	"step_results" jsonb NOT NULL,
	"resume_labels" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text NOT NULL,
	"error" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_workflows"."workflow_snapshots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "agent_workflows"."workflow_steps" (
	"run_id" uuid NOT NULL,
	"step_id" text NOT NULL,
	"tenant_id" uuid NOT NULL,
	"workflow_id" text NOT NULL,
	"status" text NOT NULL,
	"input_hash" text NOT NULL,
	"output" jsonb,
	"error" jsonb,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "workflow_steps_run_id_step_id_pk" PRIMARY KEY("run_id","step_id")
);
--> statement-breakpoint
ALTER TABLE "agent_workflows"."workflow_steps" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "wf_snapshots_tenant_status_updated_idx" ON "agent_workflows"."workflow_snapshots" USING btree ("tenant_id","status","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "wf_snapshots_workflow_status_idx" ON "agent_workflows"."workflow_snapshots" USING btree ("tenant_id","workflow_id","status");--> statement-breakpoint
CREATE INDEX "wf_steps_tenant_run_idx" ON "agent_workflows"."workflow_steps" USING btree ("tenant_id","run_id");--> statement-breakpoint
CREATE POLICY "tenant_isolation_wf_snapshots" ON "agent_workflows"."workflow_snapshots" AS PERMISSIVE FOR ALL TO "tenant_user" USING ("agent_workflows"."workflow_snapshots"."tenant_id" = current_setting('app.tenant_id', true)::uuid) WITH CHECK ("agent_workflows"."workflow_snapshots"."tenant_id" = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation_wf_steps" ON "agent_workflows"."workflow_steps" AS PERMISSIVE FOR ALL TO "tenant_user" USING ("agent_workflows"."workflow_steps"."tenant_id" = current_setting('app.tenant_id', true)::uuid) WITH CHECK ("agent_workflows"."workflow_steps"."tenant_id" = current_setting('app.tenant_id', true)::uuid);