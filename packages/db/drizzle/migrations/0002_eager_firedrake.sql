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
CREATE TABLE "planner"."plan" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"container_type" text,
	"ms_group_id" text,
	"ms_roster_id" text,
	"ms_plan_id" text,
	"ms_plan_etag" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "chk_plan_description_length" CHECK (char_length("planner"."plan"."description") <= 32000),
	CONSTRAINT "chk_plan_container_xor" CHECK (("planner"."plan"."container_type" IS NULL AND "planner"."plan"."ms_group_id" IS NULL AND "planner"."plan"."ms_roster_id" IS NULL)
        OR ("planner"."plan"."container_type" = 'group' AND "planner"."plan"."ms_group_id" IS NOT NULL AND "planner"."plan"."ms_roster_id" IS NULL)
        OR ("planner"."plan"."container_type" = 'roster' AND "planner"."plan"."ms_roster_id" IS NOT NULL AND "planner"."plan"."ms_group_id" IS NULL))
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
CREATE INDEX "idx_bucket_plan_deleted_order" ON "planner"."bucket" USING btree ("plan_id","deleted_at","order_hint") WHERE "planner"."bucket"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_bucket_tenant_ms_bucket_id" ON "planner"."bucket" USING btree ("tenant_id","ms_bucket_id") WHERE "planner"."bucket"."ms_bucket_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_plan_tenant_deleted" ON "planner"."plan" USING btree ("tenant_id","deleted_at") WHERE "planner"."plan"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_plan_tenant_created_by" ON "planner"."plan" USING btree ("tenant_id","created_by");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_plan_tenant_ms_plan_id" ON "planner"."plan" USING btree ("tenant_id","ms_plan_id") WHERE "planner"."plan"."ms_plan_id" IS NOT NULL;--> statement-breakpoint
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
ALTER TABLE "planner"."plan" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "planner"."plan" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "planner"."plan"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "planner"."plan_label" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "planner"."plan_label" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "planner"."plan_label"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "planner"."plan_member" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "planner"."plan_member" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "planner"."plan_member"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "planner"."bucket" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "planner"."bucket" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "planner"."bucket"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "planner"."task" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "planner"."task" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "planner"."task"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "planner"."task_assignee" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "planner"."task_assignee" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "planner"."task_assignee"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "planner"."task_applied_label" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "planner"."task_applied_label" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "planner"."task_applied_label"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "planner"."task_checklist_item" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "planner"."task_checklist_item" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "planner"."task_checklist_item"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "planner"."task_attachment" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "planner"."task_attachment" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "planner"."task_attachment"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "planner"."task_comment" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "planner"."task_comment" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "planner"."task_comment"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "planner"."task_evidence" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "planner"."task_evidence" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "planner"."task_evidence"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);