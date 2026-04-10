# MCP Tool Contracts

Per-module MCP tool definitions. Each subdirectory contains the tool schemas
for that module's exposed capabilities.

Tool naming convention: `{module}_{action}`
Examples: `people_get_employment_profile`, `time_submit_leave_request`

Every tool call must:

1. Check `exposure_contract` (deny-by-default access control)
2. Check `role_grant` (actor permissions)
3. Write an `audit_event` after execution

See: docs/architecture/agent-runtime.md
