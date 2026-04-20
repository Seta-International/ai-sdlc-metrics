ALTER TABLE "planner"."plan" ADD COLUMN "owner_actor_id" uuid;--> statement-breakpoint
ALTER TABLE "planner"."plan" ADD COLUMN "sync_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_plan_tenant_owner_actor" ON "planner"."plan" ("tenant_id","owner_actor_id") WHERE "owner_actor_id" IS NOT NULL;--> statement-breakpoint
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
CREATE INDEX "idx_my_day_entry_today" ON "planner"."my_day_entry" ("tenant_id","actor_id","added_date");--> statement-breakpoint
CREATE INDEX "idx_my_day_entry_task" ON "planner"."my_day_entry" ("task_id");--> statement-breakpoint
ALTER TABLE "planner"."my_day_entry" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "planner"."my_day_entry" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "planner"."my_day_entry"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
