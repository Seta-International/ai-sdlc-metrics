# timesheet-app Business Reverse-Engineering

This spike documents the existing `timesheet-app` as a business system, not as a technical stack. The repository implements an internal attendance, leave, approval, and workforce-operations application that appears designed to let a company record daily attendance, handle exceptions, approve leave, manage schedules and holidays, and export attendance data for downstream operations.

## Documents

- `01-business-overview.md`: what the system is, who uses it, what business problem it solves, its scope boundaries, and the confidence level behind each major conclusion.
- `02-capabilities-and-use-cases.md`: the main business capabilities and user-facing use cases, grouped by employee, manager, admin, and external integration behavior.
- `03-workflows-rules-and-domain.md`: the core workflows, business rules, permission boundaries, entity meanings, and operational processes that shape real-world behavior.
- `04-clone-critical-understanding.md`: the clone-critical business understanding that must be preserved if another team rebuilds this system faithfully.

## Recommended Reading Order

1. `01-business-overview.md`
2. `02-capabilities-and-use-cases.md`
3. `03-workflows-rules-and-domain.md`
4. `04-clone-critical-understanding.md`

