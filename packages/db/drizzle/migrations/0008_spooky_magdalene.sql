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
ALTER TABLE "projects"."account" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "projects"."account"
  USING ("tenant_id" = current_setting('app.tenant_id')::uuid);
--> statement-breakpoint
ALTER TABLE "projects"."project" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "projects"."project"
  USING ("tenant_id" = current_setting('app.tenant_id')::uuid);
--> statement-breakpoint
ALTER TABLE "projects"."project_role" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "projects"."project_role"
  USING ("tenant_id" = current_setting('app.tenant_id')::uuid);
--> statement-breakpoint
ALTER TABLE "projects"."allocation" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "projects"."allocation"
  USING ("tenant_id" = current_setting('app.tenant_id')::uuid);
