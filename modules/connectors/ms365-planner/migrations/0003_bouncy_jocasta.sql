CREATE TABLE "connector_ms365_planner"."plan_members" (
	"tenant_id" uuid NOT NULL,
	"plan_id" text NOT NULL,
	"user_id" text NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_members_tenant_id_plan_id_user_id_pk" PRIMARY KEY("tenant_id","plan_id","user_id")
);
