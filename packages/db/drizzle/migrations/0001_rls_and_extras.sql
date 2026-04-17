-- RLS policies for every tenant-scoped table, plus performance and search
-- indexes preserved from the previous hand-written migrations (0001, 0009, 0018-0020).
-- core.tenant has no tenant_id (it IS the tenant lookup) and is excluded.

ALTER TABLE "admin"."tenant_email_config" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "admin"."tenant_email_config" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "admin"."tenant_email_config"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "agents"."agent_insight" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "agents"."agent_insight" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "agents"."agent_insight"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "agents"."agent_message" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "agents"."agent_message" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "agents"."agent_message"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "agents"."agent_session" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "agents"."agent_session" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "agents"."agent_session"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "documents"."generation_job" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "documents"."generation_job" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "documents"."generation_job"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "documents"."template" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "documents"."template" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "documents"."template"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "documents"."tenant_branding" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "documents"."tenant_branding" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "documents"."tenant_branding"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "identity"."api_key" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "identity"."api_key" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "identity"."api_key"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "identity"."identity_provider" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "identity"."identity_provider" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "identity"."identity_provider"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "identity"."idp_group_mapping" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "identity"."idp_group_mapping" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "identity"."idp_group_mapping"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "identity"."magic_link_token" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "identity"."magic_link_token" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "identity"."magic_link_token"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "identity"."sync_history" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "identity"."sync_history" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "identity"."sync_history"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "core"."actor" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "core"."actor" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."actor"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "core"."audit_event" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "core"."audit_event" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."audit_event"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "core"."decision_case" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "core"."decision_case" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."decision_case"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "core"."decision_outcome" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "core"."decision_outcome" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."decision_outcome"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "core"."decision_step" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "core"."decision_step" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."decision_step"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "core"."delegation" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "core"."delegation" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."delegation"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "core"."department" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "core"."department" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."department"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "core"."exposure_contract" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "core"."exposure_contract" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."exposure_contract"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "core"."external_identity_map" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "core"."external_identity_map" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."external_identity_map"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "core"."org_placement" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "core"."org_placement" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."org_placement"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "core"."outbox_event" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "core"."outbox_event" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."outbox_event"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "core"."processed_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "core"."processed_events" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."processed_events"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "core"."role_grant" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "core"."role_grant" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."role_grant"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "core"."role_permission" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "core"."role_permission" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."role_permission"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "core"."user_identity" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "core"."user_identity" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."user_identity"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "core"."visibility_scope" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "core"."visibility_scope" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."visibility_scope"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "notifications"."notification" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notifications"."notification" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "notifications"."notification"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "notifications"."notification_preference" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notifications"."notification_preference" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "notifications"."notification_preference"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "people"."profile_change_request" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "people"."profile_change_request" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "people"."profile_change_request"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "people"."completeness_rule" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "people"."completeness_rule" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "people"."completeness_rule"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "people"."document_requirement" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "people"."document_requirement" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "people"."document_requirement"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "people"."employee_document" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "people"."employee_document" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "people"."employee_document"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "people"."country_field_config" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "people"."country_field_config" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "people"."country_field_config"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "people"."custom_field_definition" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "people"."custom_field_definition" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "people"."custom_field_definition"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "people"."field_edit_policy" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "people"."field_edit_policy" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "people"."field_edit_policy"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "people"."field_visibility_config" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "people"."field_visibility_config" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "people"."field_visibility_config"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "people"."bulk_operation" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "people"."bulk_operation" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "people"."bulk_operation"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "people"."contract_policy" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "people"."contract_policy" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "people"."contract_policy"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "people"."contract_version" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "people"."contract_version" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "people"."contract_version"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "people"."directory_search_index" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "people"."directory_search_index" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "people"."directory_search_index"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "people"."email_generation_config" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "people"."email_generation_config" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "people"."email_generation_config"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "people"."employment" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "people"."employment" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "people"."employment"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "people"."employment_detail" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "people"."employment_detail" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "people"."employment_detail"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "people"."import_job" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "people"."import_job" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "people"."import_job"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "people"."job_assignment" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "people"."job_assignment" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "people"."job_assignment"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "people"."job_family" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "people"."job_family" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "people"."job_family"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "people"."job_profile" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "people"."job_profile" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "people"."job_profile"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "people"."offboarding_case" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "people"."offboarding_case" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "people"."offboarding_case"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "people"."offboarding_task" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "people"."offboarding_task" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "people"."offboarding_task"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "people"."offboarding_task_template" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "people"."offboarding_task_template" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "people"."offboarding_task_template"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "people"."offboarding_template" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "people"."offboarding_template" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "people"."offboarding_template"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "people"."onboarding_case" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "people"."onboarding_case" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "people"."onboarding_case"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "people"."onboarding_task" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "people"."onboarding_task" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "people"."onboarding_task"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "people"."onboarding_task_template" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "people"."onboarding_task_template" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "people"."onboarding_task_template"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "people"."onboarding_template" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "people"."onboarding_template" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "people"."onboarding_template"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "people"."person_profile" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "people"."person_profile" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "people"."person_profile"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "people"."probation_policy" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "people"."probation_policy" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "people"."probation_policy"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "people"."probation_record" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "people"."probation_record" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "people"."probation_record"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "people"."profile_section" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "people"."profile_section" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "people"."profile_section"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "people"."profile_share_link" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "people"."profile_share_link" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "people"."profile_share_link"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "preferences"."saved_view" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "preferences"."saved_view" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "preferences"."saved_view"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "projects"."account" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "projects"."account" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "projects"."account"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "projects"."allocation" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "projects"."allocation" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "projects"."allocation"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "projects"."project" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "projects"."project" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "projects"."project"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "projects"."project_role" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "projects"."project_role" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "projects"."project_role"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint

-- Performance indexes preserved from prior hand-written migrations
CREATE INDEX "idx_role_grant_actor" ON "core"."role_grant" ("tenant_id", "actor_id");--> statement-breakpoint
CREATE INDEX "idx_project_tenant_account" ON "projects"."project" ("tenant_id", "account_id");--> statement-breakpoint
CREATE INDEX "idx_project_role_tenant_project" ON "projects"."project_role" ("tenant_id", "project_id");--> statement-breakpoint
CREATE INDEX "idx_allocation_tenant_project" ON "projects"."allocation" ("tenant_id", "project_id");--> statement-breakpoint
CREATE INDEX "idx_allocation_tenant_role" ON "projects"."allocation" ("tenant_id", "project_role_id");--> statement-breakpoint
CREATE INDEX "idx_allocation_tenant_actor" ON "projects"."allocation" ("tenant_id", "actor_id") WHERE actor_id IS NOT NULL;--> statement-breakpoint

-- Full-text search GIN index for directory (preserved from 0020)
CREATE INDEX "idx_directory_search_vector" ON "people"."directory_search_index" USING GIN (
  to_tsvector(
    'simple',
    coalesce(full_name, '') || ' ' ||
    coalesce(full_name_unaccented, '') || ' ' ||
    coalesce(company_email, '') || ' ' ||
    coalesce(job_title, '') || ' ' ||
    coalesce(department_name, '')
  )
);
