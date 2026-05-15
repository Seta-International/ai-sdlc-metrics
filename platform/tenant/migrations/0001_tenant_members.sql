CREATE TYPE "tenant"."tenant_member_role" AS ENUM('owner', 'admin', 'member');--> statement-breakpoint
CREATE TABLE "tenant"."tenant_members" (
	"user_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"role" "tenant"."tenant_member_role" DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_members_user_id_tenant_id_pk" PRIMARY KEY("user_id","tenant_id")
);
--> statement-breakpoint
ALTER TABLE "tenant"."tenant_members" ADD CONSTRAINT "tenant_members_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenant"."tenants"("id") ON DELETE no action ON UPDATE no action;