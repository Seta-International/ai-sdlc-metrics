---
module: project-staffing
task: team-orgchart
created: 2026-04-14
priority: high
depends-on: [001]
---

# Task: Project Team & Org Chart

## Scope

Implement project team membership with org chart hierarchy and team template application:

1. Project member CRUD — add/remove people from projects with structural roles
2. Project reporting hierarchy — `reports_to_member_id` creates project-scoped org chart
3. Team templates — create reusable templates, apply to a project to auto-generate demand slots

## Roles Covered

- **PROJECT_MANAGER:** Add/remove team members, set reporting lines on own project
- **ACCOUNT_MANAGER:** Manage team for projects in their account
- **HR / SUPER_ADMIN:** Manage team for any project, create/manage team templates
- **EMPLOYEE:** View project team and org chart for projects they're on

## Business Context

In consulting firms, the project team has its own hierarchy: PM → Tech Lead → Developers. This is completely separate from the company HR hierarchy (where the developer might report to an Engineering Manager who has nothing to do with this project).

Kantata and Workday both model this as a separate relationship. The project org chart answers "who do I escalate to on this project?" while the HR org chart answers "who does my performance review?"

Team templates standardize project setup. Instead of manually adding 8 demand slots for every Scrum project, pick the "Scrum Team" template and roles are pre-populated.

## Source Reference

- **Files:** `src/core/services/project_service.py` (add_employees — flat team, no hierarchy), `src/repository/project_repository.py`
- **Key logic:** Legacy has flat project-employee assignments with no reporting structure. No templates.

## Target Location

- **Where:** `apps/api/src/modules/projects/application/commands/`, `apps/api/src/modules/projects/application/queries/`
- **Conventions to follow:** Existing CQRS pattern, tRPC procedures

## Data Model

Uses `project_member`, `team_template`, `team_template_slot` tables from task 001.

Project member structural roles: `sponsor`, `project_manager`, `delivery_lead`, `tech_lead`, `team_lead`, `member`

## Interface Contract

### Project Member Commands

- `AddProjectMemberCommand { projectId, actorId, projectRole, reportsToMemberId? }`
- `UpdateProjectMemberCommand { memberId, projectRole?, reportsToMemberId? }`
- `RemoveProjectMemberCommand { memberId }` — sets `left_at`, doesn't hard delete

### Project Member Queries

- `ListProjectMembersQuery { projectId, tenantId, includeInactive? }` — returns members with reporting hierarchy
- `GetProjectOrgChartQuery { projectId, tenantId }` — returns tree structure for org chart visualization
- `ListPersonProjectsQuery { actorId, tenantId }` — all projects a person is a member of, with their role

### Team Template Commands

- `CreateTeamTemplateCommand { tenantId, name, description?, deliveryModel?, slots[] }`
- `UpdateTeamTemplateCommand { templateId, name?, description?, slots[] }`
- `DeleteTeamTemplateCommand { templateId }` — soft delete (set is_active=false)
- `ApplyTeamTemplateCommand { projectId, templateId }` — creates ProjectRole demand slots from template slots

### Team Template Queries

- `ListTeamTemplatesQuery { tenantId }` — all active templates with their slots

### tRPC procedures

- `projects.addMember`, `projects.updateMember`, `projects.removeMember`
- `projects.listMembers`, `projects.getOrgChart`, `projects.listPersonProjects`
- `projects.createTemplate`, `projects.updateTemplate`, `projects.deleteTemplate`, `projects.listTemplates`
- `projects.applyTemplate`

## Edge Cases

- **Cycle detection:** `reports_to_member_id` must not create circular reporting. Validate on insert/update by walking the chain.
- **One PM rule:** Each project should have exactly one `project_manager` member. Warn (don't block) if adding a second PM.
- **Member vs allocation:** Adding someone as a project member doesn't create an allocation. Membership is "you're on this team." Allocation is "you're spending X hours." They're independent but related.
- **Remove member with active allocations:** When removing a member, warn if they have active allocations on this project. Don't auto-close allocations — let PM decide.
- **Apply template to project with existing roles:** Append new roles, don't duplicate. Match by role_name to detect existing slots.
- **Self-removal:** Cannot remove yourself as the project_manager (same guard as legacy).
- **Template deletion:** Soft delete — existing projects that used the template are unaffected.

## Acceptance Criteria

- [ ] Add/update/remove project member commands with reporting hierarchy
- [ ] Cycle detection on `reports_to_member_id`
- [ ] Project org chart query returns tree structure
- [ ] List person's projects with their structural role
- [ ] Team template CRUD (create, update, soft-delete, list)
- [ ] Apply template to project — auto-creates ProjectRole demand slots
- [ ] Template application handles existing roles (no duplicates)
- [ ] tRPC procedures for all operations
- [ ] Unit tests for cycle detection
- [ ] Unit tests for template application with existing roles
- [ ] Integration test for full flow: create template → create project → apply template → add members → get org chart
