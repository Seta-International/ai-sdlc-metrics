## LEGEND & SUMMARY
| PMO 02 - Resource Allocation & Timesheet Monitoring Agent | Mock Dataset | Unnamed: 1 | Unnamed: 2 | Unnamed: 3 | Unnamed: 4 | Unnamed: 5 |
| --- | --- | --- | --- | --- | --- |
| Input for an agent that standardizes RA + Timesheet into a member-project-week view, flags overbook/idle, compares planned RA% vs actual logged hours, and excludes valid edge cases (leave/holiday/training/approved OT). Shared masters (members, projects) are identical to the PMO 01 file. Watch for one DUPLICATED RA row (do not double-count) and members with missing weeks (onboarding). | NaN | NaN | NaN | NaN | NaN |
| NaN | NaN | NaN | NaN | NaN | NaN |
| Sheet | Grain (1 row =) | Field | Type | Example | Description |
| DS01\_Resource\_Allocation | 1 member x project allocation (the plan) | Member\_ID | String | EMP-004 | Member (FK -> Member\_Master). |
| NaN | NaN | Project\_ID | String | PRJ-002 | Project (FK -> Project\_Master). |
| NaN | NaN | Role | Enum | BE | Role code on this allocation. |
| NaN | NaN | Allocation\_pct | Float | 0.45 | Planned RA% (share of standard week). |
| NaN | NaN | Start\_date | Date | 2026-06-29 | Allocation start. |
| NaN | NaN | End\_date | Date | 2026-08-07 | Allocation end. |
| NaN | NaN | Weekly\_planned\_hours | Float | 18.0 | allocation\_pct x member's std week (PT-aware!). |
| DS02\_Timesheet\_Log | 1 member x day x project log | Member\_ID | String | EMP-004 | Member (FK). |
| NaN | NaN | Project\_ID | String | PRJ-002 | Project (NULL = internal/training). |
| NaN | NaN | Work\_date | Date | 2026-07-07 | Work date. |
| NaN | NaN | Logged\_hours | Float | 6.5 | Hours logged that day. |
| NaN | NaN | Log\_category | Enum | Project | Project/Internal/Training/Admin. |
| NaN | NaN | Task\_ref | String | TASK-007 | Optional task reference (may be NULL). |
| DS03\_Overbook\_Idle\_Config | 1 threshold rule (read as rule engine) | Config\_ID | String | CFG-001 | Config id. |
| NaN | NaN | Rule\_name | String | SETA-08-SOP-001 | Rule set name. |
| NaN | NaN | Overbook\_threshold | Float | 1.10 | Busy > this -> Overbooked (Yellow). |
| NaN | NaN | Overbook\_red\_threshold | Float | 1.20 | Busy > this -> Overbooked (Red). |
| NaN | NaN | Idle\_threshold | Float | 0.75 | Busy < this -> Idle (aligned to SOP, not 0.20). |
| NaN | NaN | Mismatch\_pct\_threshold | Float | 0.20 | |logged-planned|/planned > this -> mismatch. |
| NaN | NaN | OT\_max\_hours\_per\_week | Float | 48.0 | Above this/week = OT to review. |
| NaN | NaN | Effective\_date | Date | 2026-01-01 | Effective date. |
| DS04\_Leave\_Holiday\_Records | 1 leave-day of a member (or a company holiday) | Record\_ID | String | LV-0002 | Record id. |
| NaN | NaN | Member\_ID | String | EMP-003 | Member (NULL = company-wide holiday). |
| NaN | NaN | Leave\_date | Date | 2026-07-06 | Date. |
| NaN | NaN | Leave\_type | Enum | Annual Leave | Annual/Sick/Maternity/Public Holiday/Training/Approved OT Comp. |
| NaN | NaN | Approved | Bool | TRUE | TRUE = approved. |
| NaN | NaN | Duration\_days | Float | 1.0 | Days (0.5 = half day). |
| NaN | NaN | Note | String | Full week leave | Note. |
| DS05\_Project\_Master | 1 project | Project\_ID | String | PRJ-002 | Project id. |
| NaN | NaN | Project\_name | String | Energent AI | Name. |
| NaN | NaN | Account\_ID | String | ACC-B | Account/client group. |
| NaN | NaN | Project\_type | String | AI/ML Platform | Type. |
| NaN | NaN | Status | Enum | Active | Active/On Hold/Completed/Cancelled. |
| NaN | NaN | PM\_ID | String | EMP-012 | PM (FK -> Member\_Master). |
| NaN | NaN | Start\_date | Date | 2026-04-06 | Start. |
| NaN | NaN | End\_date | Date | 2026-12-31 | Planned end. |
| DS06\_Member\_Master | 1 member | Member\_ID | String | EMP-009 | Member id. |
| NaN | NaN | Full\_name | String | Ly Van Minh | Name. |
| NaN | NaN | Department | String | Frontend | Department. |
| NaN | NaN | Role\_title | String | Frontend Developer | Title. |
| NaN | NaN | Level | String | L2 | Level L1-L7. |
| NaN | NaN | Line\_manager\_id | String | EMP-004 | Manager (FK). |
| NaN | NaN | Employment\_status | Enum | Probation | Active/Probation/On Leave/Resigned. |
| NaN | NaN | Employment | Enum | FT | FT/PT. |
| NaN | NaN | Std\_hours\_week | Float | 40 | Standard hours/week (PT = 20). |
| NaN | NaN | Join\_date | Date | 2026-07-14 | Join date (drives onboarding edge). |
| REF\_Calendar\_Weeks  [SHARED/REF] | 1 week of the monitoring window | Week\_ID | String | W3 | Week id. |
| NaN | NaN | Week\_start | Date | 2026-07-13 | Monday. |
| NaN | NaN | Working\_days | Int | 4 | Working days (holiday reduces this). |
| NaN | NaN | Holiday\_hours\_ft | Float | 8 | FT hours lost to holidays that week. |
| REF\_KPI\_Norms  [SHARED/REF] | 1 RAG metric threshold (SETA-08-SOP-001) | Norm\_ID | String | N01 | Norm id. |
| NaN | NaN | Metric | String | Busy Rate | Metric. |
| NaN | NaN | Green/Yellow/Red | String | 85-110% / ... | RAG thresholds. |
| Answer\_Key  [ANSWER KEY] | 1 finding the agent should detect (Problem 2) | Finding\_ID | String | F-07 | Finding id. |
| NaN | NaN | Entity\_id | String | EMP-004 | Member/week. |
| NaN | NaN | Issue\_type | String | Overbook | Category. |
| NaN | NaN | Expected\_detection | String | Busy 125% -> rebalance | What to detect. |
| NaN | NaN | Severity | String | High | Severity. |

## DS01_Resource_Allocation
| Member\_ID | Project\_ID | Role | Allocation\_pct | Start\_date | End\_date | Weekly\_planned\_hours |
| --- | --- | --- | --- | --- | --- | --- |
| EMP-001 | PRJ-001 | BE | 0.60 | 2026-06-29 | 2026-08-07 | 24.0 |
| EMP-001 | PRJ-003 | BE | 0.55 | 2026-06-29 | 2026-08-07 | 22.0 |
| EMP-002 | PRJ-002 | DE | 0.90 | 2026-06-29 | 2026-08-07 | 36.0 |
| EMP-003 | PRJ-002 | ML | 1.00 | 2026-06-29 | 2026-08-07 | 40.0 |
| EMP-004 | PRJ-001 | BE | 0.80 | 2026-06-29 | 2026-08-07 | 32.0 |
| EMP-004 | PRJ-002 | BE | 0.45 | 2026-06-29 | 2026-08-07 | 18.0 |
| EMP-005 | PRJ-001 | DevOps | 0.30 | 2026-06-29 | 2026-08-07 | 12.0 |
| EMP-005 | PRJ-002 | DevOps | 0.30 | 2026-06-29 | 2026-08-07 | 12.0 |
| EMP-006 | PRJ-001 | Sec | 0.95 | 2026-06-29 | 2026-08-07 | 38.0 |
| EMP-007 | PRJ-002 | Design | 0.80 | 2026-06-29 | 2026-08-07 | 16.0 |
| EMP-008 | PRJ-002 | BA | 0.50 | 2026-06-29 | 2026-08-07 | 20.0 |
| EMP-009 | PRJ-002 | FE | 0.80 | 2026-07-13 | 2026-08-07 | 32.0 |
| EMP-010 | PRJ-001 | QA | 0.60 | 2026-06-29 | 2026-08-07 | 24.0 |
| EMP-010 | PRJ-002 | QA | 0.50 | 2026-06-29 | 2026-08-07 | 20.0 |
| EMP-010 | PRJ-002 | QA | 0.50 | 2026-06-29 | 2026-08-07 | 20.0 |
| EMP-103 | PRJ-103 | BE | 0.86 | 2026-06-29 | 2026-08-07 | 34.4 |
| EMP-104 | PRJ-102 | BA | 0.85 | 2026-06-29 | 2026-08-07 | 34.0 |
| EMP-105 | PRJ-106 | DevOps | 0.86 | 2026-06-29 | 2026-08-07 | 34.4 |
| EMP-106 | PRJ-103 | FE | 1.01 | 2026-06-29 | 2026-08-07 | 40.4 |
| EMP-107 | PRJ-104 | DE | 0.45 | 2026-06-29 | 2026-08-07 | 18.0 |
| EMP-107 | PRJ-102 | DE | 0.50 | 2026-06-29 | 2026-08-07 | 20.0 |
| EMP-108 | PRJ-102 | FE | 0.53 | 2026-06-29 | 2026-08-07 | 21.2 |
| EMP-108 | PRJ-103 | FE | 0.39 | 2026-06-29 | 2026-08-07 | 15.6 |
| EMP-109 | PRJ-108 | DevOps | 0.96 | 2026-06-29 | 2026-08-07 | 38.4 |
| EMP-110 | PRJ-101 | FE | 0.56 | 2026-06-29 | 2026-08-07 | 22.4 |
| EMP-110 | PRJ-105 | FE | 0.42 | 2026-06-29 | 2026-08-07 | 16.8 |
| EMP-111 | PRJ-105 | BA | 1.04 | 2026-06-29 | 2026-08-07 | 41.6 |
| EMP-112 | PRJ-105 | BA | 0.44 | 2026-06-29 | 2026-08-07 | 17.6 |
| EMP-112 | PRJ-102 | BA | 0.60 | 2026-06-29 | 2026-08-07 | 24.0 |
| EMP-113 | PRJ-106 | BE | 0.86 | 2026-06-29 | 2026-08-07 | 17.2 |
| EMP-114 | PRJ-102 | Design | 0.43 | 2026-06-29 | 2026-08-07 | 8.6 |
| EMP-114 | PRJ-108 | Design | 0.48 | 2026-06-29 | 2026-08-07 | 9.6 |
| EMP-115 | PRJ-102 | Design | 0.60 | 2026-06-29 | 2026-08-07 | 24.0 |
| EMP-115 | PRJ-105 | Design | 0.32 | 2026-06-29 | 2026-08-07 | 12.8 |
| EMP-116 | PRJ-105 | QA | 0.49 | 2026-06-29 | 2026-08-07 | 19.6 |
| EMP-116 | PRJ-104 | QA | 0.49 | 2026-06-29 | 2026-08-07 | 19.6 |
| EMP-117 | PRJ-102 | ML | 0.49 | 2026-06-29 | 2026-08-07 | 19.6 |
| EMP-117 | PRJ-106 | ML | 0.55 | 2026-06-29 | 2026-08-07 | 22.0 |
| EMP-118 | PRJ-101 | Design | 0.48 | 2026-06-29 | 2026-08-07 | 19.2 |
| EMP-118 | PRJ-105 | Design | 0.61 | 2026-06-29 | 2026-08-07 | 24.4 |

## DS02_Timesheet_Log
| Member\_ID | Project\_ID | Work\_date | Logged\_hours | Log\_category | Task\_ref |
| --- | --- | --- | --- | --- | --- |
| EMP-001 | PRJ-001 | 2026-06-29 | 4.5 | Project | NaN |
| EMP-001 | PRJ-003 | 2026-06-29 | 4.0 | Project | NaN |
| EMP-001 | PRJ-001 | 2026-06-30 | 4.5 | Project | NaN |
| EMP-001 | PRJ-003 | 2026-06-30 | 4.5 | Project | NaN |
| EMP-001 | PRJ-001 | 2026-07-01 | 5.0 | Project | NaN |
| EMP-001 | PRJ-003 | 2026-07-01 | 4.5 | Project | NaN |
| EMP-001 | PRJ-001 | 2026-07-02 | 5.0 | Project | NaN |
| EMP-001 | PRJ-003 | 2026-07-02 | 4.5 | Project | NaN |
| EMP-001 | PRJ-001 | 2026-07-03 | 5.0 | Project | NaN |
| EMP-001 | PRJ-003 | 2026-07-03 | 4.5 | Project | NaN |
| EMP-001 | PRJ-001 | 2026-07-06 | 4.5 | Project | NaN |
| EMP-001 | PRJ-003 | 2026-07-06 | 4.0 | Project | NaN |
| EMP-001 | PRJ-001 | 2026-07-07 | 4.5 | Project | NaN |
| EMP-001 | PRJ-003 | 2026-07-07 | 4.5 | Project | NaN |
| EMP-001 | PRJ-001 | 2026-07-08 | 5.0 | Project | NaN |
| EMP-001 | PRJ-003 | 2026-07-08 | 4.5 | Project | NaN |
| EMP-001 | PRJ-001 | 2026-07-09 | 5.0 | Project | NaN |
| EMP-001 | PRJ-003 | 2026-07-09 | 4.5 | Project | NaN |
| EMP-001 | PRJ-001 | 2026-07-10 | 5.0 | Project | NaN |
| EMP-001 | PRJ-003 | 2026-07-10 | 4.5 | Project | NaN |
| EMP-001 | PRJ-001 | 2026-07-14 | 5.0 | Project | NaN |
| EMP-001 | PRJ-003 | 2026-07-14 | 4.5 | Project | NaN |
| EMP-001 | PRJ-001 | 2026-07-15 | 5.0 | Project | NaN |
| EMP-001 | PRJ-003 | 2026-07-15 | 4.5 | Project | NaN |
| EMP-001 | PRJ-001 | 2026-07-16 | 5.0 | Project | NaN |
| EMP-001 | PRJ-003 | 2026-07-16 | 4.5 | Project | NaN |
| EMP-001 | PRJ-001 | 2026-07-17 | 5.0 | Project | NaN |
| EMP-001 | PRJ-003 | 2026-07-17 | 4.5 | Project | NaN |
| EMP-001 | PRJ-001 | 2026-07-20 | 4.5 | Project | NaN |
| EMP-001 | PRJ-003 | 2026-07-20 | 4.0 | Project | NaN |
| EMP-001 | PRJ-001 | 2026-07-21 | 4.5 | Project | NaN |
| EMP-001 | PRJ-003 | 2026-07-21 | 4.5 | Project | NaN |
| EMP-001 | PRJ-001 | 2026-07-22 | 5.0 | Project | NaN |
| EMP-001 | PRJ-003 | 2026-07-22 | 4.5 | Project | NaN |
| EMP-001 | PRJ-001 | 2026-07-23 | 5.0 | Project | NaN |
| EMP-001 | PRJ-003 | 2026-07-23 | 4.5 | Project | NaN |
| EMP-001 | PRJ-001 | 2026-07-24 | 5.0 | Project | NaN |
| EMP-001 | PRJ-003 | 2026-07-24 | 4.5 | Project | NaN |
| EMP-001 | PRJ-001 | 2026-07-27 | 4.5 | Project | NaN |
| EMP-001 | PRJ-003 | 2026-07-27 | 4.5 | Project | NaN |
| EMP-001 | PRJ-001 | 2026-07-28 | 4.5 | Project | NaN |
| EMP-001 | PRJ-003 | 2026-07-28 | 4.5 | Project | NaN |
| EMP-001 | PRJ-001 | 2026-07-29 | 5.0 | Project | NaN |
| EMP-001 | PRJ-003 | 2026-07-29 | 5.0 | Project | NaN |
| EMP-001 | PRJ-001 | 2026-07-30 | 5.0 | Project | NaN |
| EMP-001 | PRJ-003 | 2026-07-30 | 5.0 | Project | NaN |
| EMP-001 | PRJ-001 | 2026-07-31 | 5.0 | Project | NaN |
| EMP-001 | PRJ-003 | 2026-07-31 | 5.0 | Project | NaN |
| EMP-001 | PRJ-001 | 2026-08-03 | 4.5 | Project | NaN |
| EMP-001 | PRJ-003 | 2026-08-03 | 4.5 | Project | NaN |
| EMP-001 | PRJ-001 | 2026-08-04 | 4.5 | Project | NaN |
| EMP-001 | PRJ-003 | 2026-08-04 | 4.5 | Project | NaN |
| EMP-001 | PRJ-001 | 2026-08-05 | 5.0 | Project | NaN |
| EMP-001 | PRJ-003 | 2026-08-05 | 5.0 | Project | NaN |
| EMP-001 | PRJ-001 | 2026-08-06 | 5.0 | Project | NaN |
| EMP-001 | PRJ-003 | 2026-08-06 | 5.0 | Project | NaN |
| EMP-001 | PRJ-001 | 2026-08-07 | 5.0 | Project | NaN |
| EMP-001 | PRJ-003 | 2026-08-07 | 5.0 | Project | NaN |
| EMP-002 | PRJ-002 | 2026-06-29 | 4.0 | Project | NaN |
| EMP-002 | PRJ-002 | 2026-06-30 | 4.0 | Project | NaN |
| EMP-002 | PRJ-002 | 2026-07-01 | 4.0 | Project | NaN |
| EMP-002 | PRJ-002 | 2026-07-02 | 4.0 | Project | NaN |
| EMP-002 | PRJ-002 | 2026-07-03 | 4.0 | Project | NaN |
| EMP-002 | PRJ-002 | 2026-07-06 | 4.0 | Project | NaN |
| EMP-002 | PRJ-002 | 2026-07-07 | 3.5 | Project | NaN |
| EMP-002 | PRJ-002 | 2026-07-08 | 3.5 | Project | NaN |
| EMP-002 | PRJ-002 | 2026-07-09 | 3.5 | Project | NaN |
| EMP-002 | PRJ-002 | 2026-07-10 | 3.5 | Project | NaN |
| EMP-002 | PRJ-002 | 2026-07-14 | 4.0 | Project | NaN |
| EMP-002 | PRJ-002 | 2026-07-15 | 4.0 | Project | NaN |
| EMP-002 | PRJ-002 | 2026-07-16 | 4.0 | Project | NaN |
| EMP-002 | PRJ-002 | 2026-07-17 | 4.0 | Project | NaN |
| EMP-002 | PRJ-002 | 2026-07-20 | 4.0 | Project | NaN |
| EMP-002 | PRJ-002 | 2026-07-21 | 4.0 | Project | NaN |
| EMP-002 | PRJ-002 | 2026-07-22 | 4.0 | Project | NaN |
| EMP-002 | PRJ-002 | 2026-07-23 | 4.0 | Project | NaN |
| EMP-002 | PRJ-002 | 2026-07-24 | 4.0 | Project | NaN |
| EMP-002 | PRJ-002 | 2026-07-27 | 4.0 | Project | NaN |
| EMP-002 | PRJ-002 | 2026-07-28 | 4.0 | Project | NaN |
| EMP-002 | PRJ-002 | 2026-07-29 | 4.0 | Project | NaN |
| EMP-002 | PRJ-002 | 2026-07-30 | 4.0 | Project | NaN |
| EMP-002 | PRJ-002 | 2026-07-31 | 4.0 | Project | NaN |
| EMP-002 | PRJ-002 | 2026-08-03 | 4.0 | Project | NaN |
| EMP-002 | PRJ-002 | 2026-08-04 | 3.5 | Project | NaN |
| EMP-002 | PRJ-002 | 2026-08-05 | 3.5 | Project | NaN |
| EMP-002 | PRJ-002 | 2026-08-06 | 3.5 | Project | NaN |
| EMP-002 | PRJ-002 | 2026-08-07 | 3.5 | Project | NaN |
| EMP-003 | PRJ-002 | 2026-06-29 | 8.0 | Project | NaN |
| EMP-003 | PRJ-002 | 2026-06-30 | 8.0 | Project | NaN |
| EMP-003 | PRJ-002 | 2026-07-01 | 8.0 | Project | NaN |
| EMP-003 | PRJ-002 | 2026-07-02 | 8.0 | Project | NaN |
| EMP-003 | PRJ-002 | 2026-07-03 | 8.0 | Project | NaN |
| EMP-003 | PRJ-002 | 2026-07-14 | 6.0 | Project | NaN |
| EMP-003 | PRJ-002 | 2026-07-15 | 6.0 | Project | NaN |
| EMP-003 | PRJ-002 | 2026-07-16 | 6.0 | Project | NaN |
| EMP-003 | PRJ-002 | 2026-07-17 | 6.0 | Project | NaN |
| EMP-003 | PRJ-002 | 2026-07-20 | 8.0 | Project | NaN |
| EMP-003 | PRJ-002 | 2026-07-21 | 8.0 | Project | NaN |
| EMP-003 | PRJ-002 | 2026-07-22 | 8.0 | Project | NaN |
| EMP-003 | PRJ-002 | 2026-07-23 | 8.0 | Project | NaN |
| EMP-003 | PRJ-002 | 2026-07-24 | 8.0 | Project | NaN |
| EMP-003 | PRJ-002 | 2026-07-27 | 10.0 | Project | NaN |
| EMP-003 | PRJ-002 | 2026-07-28 | 10.5 | Project | NaN |
| EMP-003 | PRJ-002 | 2026-07-29 | 10.5 | Project | NaN |
| EMP-003 | PRJ-002 | 2026-07-30 | 10.5 | Project | NaN |
| EMP-003 | PRJ-002 | 2026-07-31 | 10.5 | Project | NaN |
| EMP-003 | PRJ-002 | 2026-08-03 | 8.0 | Project | NaN |
| EMP-003 | PRJ-002 | 2026-08-04 | 8.0 | Project | NaN |
| EMP-003 | PRJ-002 | 2026-08-05 | 8.0 | Project | NaN |
| EMP-003 | PRJ-002 | 2026-08-06 | 8.0 | Project | NaN |
| EMP-003 | PRJ-002 | 2026-08-07 | 8.0 | Project | NaN |
| EMP-004 | PRJ-001 | 2026-06-29 | 6.0 | Project | NaN |
| EMP-004 | PRJ-002 | 2026-06-29 | 4.0 | Project | NaN |
| EMP-004 | PRJ-001 | 2026-06-30 | 6.5 | Project | NaN |
| EMP-004 | PRJ-002 | 2026-06-30 | 3.5 | Project | NaN |
| EMP-004 | PRJ-001 | 2026-07-01 | 6.5 | Project | NaN |
| EMP-004 | PRJ-002 | 2026-07-01 | 3.5 | Project | NaN |
| EMP-004 | PRJ-001 | 2026-07-02 | 6.5 | Project | NaN |
| EMP-004 | PRJ-002 | 2026-07-02 | 3.5 | Project | NaN |
| EMP-004 | PRJ-001 | 2026-07-03 | 6.5 | Project | NaN |
| EMP-004 | PRJ-002 | 2026-07-03 | 3.5 | Project | NaN |
| EMP-004 | PRJ-001 | 2026-07-06 | 6.0 | Project | NaN |
| EMP-004 | PRJ-002 | 2026-07-06 | 4.0 | Project | NaN |
| EMP-004 | PRJ-001 | 2026-07-07 | 6.5 | Project | NaN |
| EMP-004 | PRJ-002 | 2026-07-07 | 3.5 | Project | NaN |
| EMP-004 | PRJ-001 | 2026-07-08 | 6.5 | Project | NaN |
| EMP-004 | PRJ-002 | 2026-07-08 | 3.5 | Project | NaN |
| EMP-004 | PRJ-001 | 2026-07-09 | 6.5 | Project | NaN |
| EMP-004 | PRJ-002 | 2026-07-09 | 3.5 | Project | NaN |
| EMP-004 | PRJ-001 | 2026-07-10 | 6.5 | Project | NaN |
| EMP-004 | PRJ-002 | 2026-07-10 | 3.5 | Project | NaN |
| EMP-004 | PRJ-001 | 2026-07-14 | 6.5 | Project | NaN |
| EMP-004 | PRJ-002 | 2026-07-14 | 3.5 | Project | NaN |
| EMP-004 | PRJ-001 | 2026-07-15 | 6.5 | Project | NaN |
| EMP-004 | PRJ-002 | 2026-07-15 | 3.5 | Project | NaN |
| EMP-004 | PRJ-001 | 2026-07-16 | 6.5 | Project | NaN |
| EMP-004 | PRJ-002 | 2026-07-16 | 3.5 | Project | NaN |
| EMP-004 | PRJ-001 | 2026-07-17 | 6.5 | Project | NaN |
| EMP-004 | PRJ-002 | 2026-07-17 | 3.5 | Project | NaN |
| EMP-004 | PRJ-001 | 2026-07-20 | 6.0 | Project | NaN |
| EMP-004 | PRJ-002 | 2026-07-20 | 4.0 | Project | NaN |
| EMP-004 | PRJ-001 | 2026-07-21 | 6.5 | Project | NaN |
| EMP-004 | PRJ-002 | 2026-07-21 | 3.5 | Project | NaN |
| EMP-004 | PRJ-001 | 2026-07-22 | 6.5 | Project | NaN |
| EMP-004 | PRJ-002 | 2026-07-22 | 3.5 | Project | NaN |
| EMP-004 | PRJ-001 | 2026-07-23 | 6.5 | Project | NaN |
| EMP-004 | PRJ-002 | 2026-07-23 | 3.5 | Project | NaN |
| EMP-004 | PRJ-001 | 2026-07-24 | 6.5 | Project | NaN |
| EMP-004 | PRJ-002 | 2026-07-24 | 3.5 | Project | NaN |
| EMP-004 | PRJ-001 | 2026-07-27 | 6.0 | Project | NaN |
| EMP-004 | PRJ-002 | 2026-07-27 | 4.0 | Project | NaN |
| EMP-004 | PRJ-001 | 2026-07-28 | 6.5 | Project | NaN |
| EMP-004 | PRJ-002 | 2026-07-28 | 3.5 | Project | NaN |
| EMP-004 | PRJ-001 | 2026-07-29 | 6.5 | Project | NaN |
| EMP-004 | PRJ-002 | 2026-07-29 | 3.5 | Project | NaN |
| EMP-004 | PRJ-001 | 2026-07-30 | 6.5 | Project | NaN |
| EMP-004 | PRJ-002 | 2026-07-30 | 3.5 | Project | NaN |
| EMP-004 | PRJ-001 | 2026-07-31 | 6.5 | Project | NaN |
| EMP-004 | PRJ-002 | 2026-07-31 | 3.5 | Project | NaN |
| EMP-004 | PRJ-001 | 2026-08-03 | 6.0 | Project | NaN |
| EMP-004 | PRJ-002 | 2026-08-03 | 4.0 | Project | NaN |
| EMP-004 | PRJ-001 | 2026-08-04 | 6.5 | Project | NaN |
| EMP-004 | PRJ-002 | 2026-08-04 | 3.5 | Project | NaN |
| EMP-004 | PRJ-001 | 2026-08-05 | 6.5 | Project | NaN |
| EMP-004 | PRJ-002 | 2026-08-05 | 3.5 | Project | NaN |
| EMP-004 | PRJ-001 | 2026-08-06 | 6.5 | Project | NaN |
| EMP-004 | PRJ-002 | 2026-08-06 | 3.5 | Project | NaN |
| EMP-004 | PRJ-001 | 2026-08-07 | 6.5 | Project | NaN |
| EMP-004 | PRJ-002 | 2026-08-07 | 3.5 | Project | NaN |
| EMP-005 | PRJ-001 | 2026-06-29 | 2.0 | Project | NaN |
| EMP-005 | PRJ-002 | 2026-06-29 | 2.0 | Project | NaN |
| EMP-005 | PRJ-001 | 2026-06-30 | 2.5 | Project | NaN |
| EMP-005 | PRJ-002 | 2026-06-30 | 2.5 | Project | NaN |
| EMP-005 | PRJ-001 | 2026-07-01 | 2.5 | Project | NaN |
| EMP-005 | PRJ-002 | 2026-07-01 | 2.5 | Project | NaN |
| EMP-005 | PRJ-001 | 2026-07-02 | 2.5 | Project | NaN |
| EMP-005 | PRJ-002 | 2026-07-02 | 2.5 | Project | NaN |
| EMP-005 | PRJ-001 | 2026-07-03 | 2.5 | Project | NaN |
| EMP-005 | PRJ-002 | 2026-07-03 | 2.5 | Project | NaN |
| EMP-005 | PRJ-001 | 2026-07-06 | 2.0 | Project | NaN |
| EMP-005 | PRJ-002 | 2026-07-06 | 2.0 | Project | NaN |
| EMP-005 | PRJ-001 | 2026-07-07 | 2.5 | Project | NaN |
| EMP-005 | PRJ-002 | 2026-07-07 | 2.5 | Project | NaN |
| EMP-005 | PRJ-001 | 2026-07-08 | 2.5 | Project | NaN |
| EMP-005 | PRJ-002 | 2026-07-08 | 2.5 | Project | NaN |
| EMP-005 | PRJ-001 | 2026-07-09 | 2.5 | Project | NaN |
| EMP-005 | PRJ-002 | 2026-07-09 | 2.5 | Project | NaN |
| EMP-005 | PRJ-001 | 2026-07-10 | 2.5 | Project | NaN |
| EMP-005 | PRJ-002 | 2026-07-10 | 2.5 | Project | NaN |
| EMP-005 | PRJ-001 | 2026-07-14 | 2.5 | Project | NaN |
| EMP-005 | PRJ-002 | 2026-07-14 | 2.5 | Project | NaN |
| EMP-005 | PRJ-001 | 2026-07-15 | 2.5 | Project | NaN |
| EMP-005 | PRJ-002 | 2026-07-15 | 2.5 | Project | NaN |
| EMP-005 | PRJ-001 | 2026-07-16 | 2.5 | Project | NaN |
| EMP-005 | PRJ-002 | 2026-07-16 | 2.5 | Project | NaN |
| EMP-005 | PRJ-001 | 2026-07-17 | 2.5 | Project | NaN |
| EMP-005 | PRJ-002 | 2026-07-17 | 2.5 | Project | NaN |
| EMP-005 | PRJ-001 | 2026-07-20 | 2.0 | Project | NaN |
| EMP-005 | PRJ-002 | 2026-07-20 | 2.0 | Project | NaN |
| EMP-005 | PRJ-001 | 2026-07-21 | 2.5 | Project | NaN |
| EMP-005 | PRJ-002 | 2026-07-21 | 2.5 | Project | NaN |
| EMP-005 | PRJ-001 | 2026-07-22 | 2.5 | Project | NaN |
| EMP-005 | PRJ-002 | 2026-07-22 | 2.5 | Project | NaN |
| EMP-005 | PRJ-001 | 2026-07-23 | 2.5 | Project | NaN |
| EMP-005 | PRJ-002 | 2026-07-23 | 2.5 | Project | NaN |
| EMP-005 | PRJ-001 | 2026-07-24 | 2.5 | Project | NaN |
| EMP-005 | PRJ-002 | 2026-07-24 | 2.5 | Project | NaN |
| EMP-005 | PRJ-001 | 2026-07-27 | 2.0 | Project | NaN |
| EMP-005 | PRJ-002 | 2026-07-27 | 2.0 | Project | NaN |
| EMP-005 | PRJ-001 | 2026-07-28 | 2.5 | Project | NaN |
| EMP-005 | PRJ-002 | 2026-07-28 | 2.5 | Project | NaN |
| EMP-005 | PRJ-001 | 2026-07-29 | 2.5 | Project | NaN |
| EMP-005 | PRJ-002 | 2026-07-29 | 2.5 | Project | NaN |
| EMP-005 | PRJ-001 | 2026-07-30 | 2.5 | Project | NaN |
| EMP-005 | PRJ-002 | 2026-07-30 | 2.5 | Project | NaN |
| EMP-005 | PRJ-001 | 2026-07-31 | 2.5 | Project | NaN |
| EMP-005 | PRJ-002 | 2026-07-31 | 2.5 | Project | NaN |
| EMP-005 | PRJ-001 | 2026-08-03 | 2.0 | Project | NaN |
| EMP-005 | PRJ-002 | 2026-08-03 | 2.0 | Project | NaN |
| EMP-005 | PRJ-001 | 2026-08-04 | 2.5 | Project | NaN |
| EMP-005 | PRJ-002 | 2026-08-04 | 2.5 | Project | NaN |
| EMP-005 | PRJ-001 | 2026-08-05 | 2.5 | Project | NaN |
| EMP-005 | PRJ-002 | 2026-08-05 | 2.5 | Project | NaN |
| EMP-005 | PRJ-001 | 2026-08-06 | 2.5 | Project | NaN |
| EMP-005 | PRJ-002 | 2026-08-06 | 2.5 | Project | NaN |
| EMP-005 | PRJ-001 | 2026-08-07 | 2.5 | Project | NaN |
| EMP-005 | PRJ-002 | 2026-08-07 | 2.5 | Project | NaN |
| EMP-006 | PRJ-001 | 2026-06-29 | 10.0 | Project | NaN |
| EMP-006 | PRJ-001 | 2026-06-30 | 9.5 | Project | NaN |
| EMP-006 | PRJ-001 | 2026-07-01 | 9.5 | Project | NaN |
| EMP-006 | PRJ-001 | 2026-07-02 | 9.5 | Project | NaN |
| EMP-006 | PRJ-001 | 2026-07-03 | 9.5 | Project | NaN |
| EMP-006 | PRJ-001 | 2026-07-06 | 10.0 | Project | NaN |
| EMP-006 | PRJ-001 | 2026-07-07 | 9.5 | Project | NaN |
| EMP-006 | PRJ-001 | 2026-07-08 | 9.5 | Project | NaN |
| EMP-006 | PRJ-001 | 2026-07-09 | 9.5 | Project | NaN |
| EMP-006 | PRJ-001 | 2026-07-10 | 9.5 | Project | NaN |
| EMP-006 | PRJ-001 | 2026-07-14 | 10.0 | Project | NaN |
| EMP-006 | PRJ-001 | 2026-07-15 | 10.0 | Project | NaN |
| EMP-006 | PRJ-001 | 2026-07-16 | 10.0 | Project | NaN |
| EMP-006 | PRJ-001 | 2026-07-17 | 10.0 | Project | NaN |
| EMP-006 | PRJ-001 | 2026-07-20 | 10.0 | Project | NaN |
| EMP-006 | PRJ-001 | 2026-07-21 | 9.5 | Project | NaN |
| EMP-006 | PRJ-001 | 2026-07-22 | 9.5 | Project | NaN |
| EMP-006 | PRJ-001 | 2026-07-23 | 9.5 | Project | NaN |
| EMP-006 | PRJ-001 | 2026-07-24 | 9.5 | Project | NaN |
| EMP-006 | PRJ-001 | 2026-07-27 | 10.0 | Project | NaN |
| EMP-006 | PRJ-001 | 2026-07-28 | 10.0 | Project | NaN |
| EMP-006 | PRJ-001 | 2026-07-29 | 10.0 | Project | NaN |
| EMP-006 | PRJ-001 | 2026-07-30 | 10.0 | Project | NaN |
| EMP-006 | PRJ-001 | 2026-07-31 | 10.0 | Project | NaN |
| EMP-006 | PRJ-001 | 2026-08-03 | 10.0 | Project | NaN |
| EMP-006 | PRJ-001 | 2026-08-04 | 9.5 | Project | NaN |
| EMP-006 | PRJ-001 | 2026-08-05 | 9.5 | Project | NaN |
| EMP-006 | PRJ-001 | 2026-08-06 | 9.5 | Project | NaN |
| EMP-006 | PRJ-001 | 2026-08-07 | 9.5 | Project | NaN |
| EMP-007 | PRJ-002 | 2026-06-29 | 3.5 | Project | NaN |
| EMP-007 | PRJ-002 | 2026-06-30 | 3.5 | Project | NaN |
| EMP-007 | PRJ-002 | 2026-07-01 | 3.0 | Project | NaN |
| EMP-007 | PRJ-002 | 2026-07-02 | 3.0 | Project | NaN |
| EMP-007 | PRJ-002 | 2026-07-03 | 3.0 | Project | NaN |
| EMP-007 | PRJ-002 | 2026-07-06 | 3.5 | Project | NaN |
| EMP-007 | PRJ-002 | 2026-07-07 | 3.5 | Project | NaN |
| EMP-007 | PRJ-002 | 2026-07-08 | 3.0 | Project | NaN |
| EMP-007 | PRJ-002 | 2026-07-09 | 3.0 | Project | NaN |
| EMP-007 | PRJ-002 | 2026-07-10 | 3.0 | Project | NaN |
| EMP-007 | PRJ-002 | 2026-07-14 | 3.0 | Project | NaN |
| EMP-007 | PRJ-002 | 2026-07-15 | 3.0 | Project | NaN |
| EMP-007 | PRJ-002 | 2026-07-16 | 3.0 | Project | NaN |
| EMP-007 | PRJ-002 | 2026-07-17 | 3.0 | Project | NaN |
| EMP-007 | PRJ-002 | 2026-07-20 | 3.5 | Project | NaN |
| EMP-007 | PRJ-002 | 2026-07-21 | 3.5 | Project | NaN |
| EMP-007 | PRJ-002 | 2026-07-22 | 3.0 | Project | NaN |
| EMP-007 | PRJ-002 | 2026-07-23 | 3.0 | Project | NaN |
| EMP-007 | PRJ-002 | 2026-07-24 | 3.0 | Project | NaN |
| EMP-007 | PRJ-002 | 2026-07-27 | 3.5 | Project | NaN |
| EMP-007 | PRJ-002 | 2026-07-28 | 3.5 | Project | NaN |
| EMP-007 | PRJ-002 | 2026-07-29 | 3.0 | Project | NaN |
| EMP-007 | PRJ-002 | 2026-07-30 | 3.0 | Project | NaN |
| EMP-007 | PRJ-002 | 2026-07-31 | 3.0 | Project | NaN |
| EMP-007 | PRJ-002 | 2026-08-03 | 3.5 | Project | NaN |
| EMP-007 | PRJ-002 | 2026-08-04 | 3.5 | Project | NaN |
| EMP-007 | PRJ-002 | 2026-08-05 | 3.0 | Project | NaN |
| EMP-007 | PRJ-002 | 2026-08-06 | 3.0 | Project | NaN |
| EMP-007 | PRJ-002 | 2026-08-07 | 3.0 | Project | NaN |
| EMP-008 | PRJ-002 | 2026-06-29 | 4.0 | Project | NaN |
| EMP-008 | PRJ-002 | 2026-06-30 | 4.0 | Project | NaN |
| EMP-008 | PRJ-002 | 2026-07-01 | 4.0 | Project | NaN |
| EMP-008 | PRJ-002 | 2026-07-02 | 4.0 | Project | NaN |
| EMP-008 | PRJ-002 | 2026-07-03 | 4.0 | Project | NaN |
| EMP-008 | PRJ-002 | 2026-07-06 | 4.0 | Project | NaN |
| EMP-008 | PRJ-002 | 2026-07-07 | 4.0 | Project | NaN |
| EMP-008 | PRJ-002 | 2026-07-08 | 4.0 | Project | NaN |
| EMP-008 | PRJ-002 | 2026-07-09 | 4.0 | Project | NaN |
| EMP-008 | PRJ-002 | 2026-07-10 | 4.0 | Project | NaN |
| EMP-008 | PRJ-002 | 2026-07-14 | 4.0 | Project | NaN |
| EMP-008 | PRJ-002 | 2026-07-15 | 4.0 | Project | NaN |
| EMP-008 | PRJ-002 | 2026-07-16 | 4.0 | Project | NaN |
| EMP-008 | PRJ-002 | 2026-07-17 | 4.0 | Project | NaN |
| EMP-008 | PRJ-002 | 2026-07-20 | 4.0 | Project | NaN |
| EMP-008 | PRJ-002 | 2026-07-21 | 4.0 | Project | NaN |
| EMP-008 | PRJ-002 | 2026-07-22 | 4.0 | Project | NaN |
| EMP-008 | PRJ-002 | 2026-07-23 | 4.0 | Project | NaN |
| EMP-008 | PRJ-002 | 2026-07-24 | 4.0 | Project | NaN |
| EMP-008 | PRJ-002 | 2026-07-27 | 4.0 | Project | NaN |
| EMP-008 | PRJ-002 | 2026-07-28 | 4.0 | Project | NaN |
| EMP-008 | PRJ-002 | 2026-07-29 | 4.0 | Project | NaN |
| EMP-008 | PRJ-002 | 2026-07-30 | 4.0 | Project | NaN |
| EMP-008 | PRJ-002 | 2026-07-31 | 4.0 | Project | NaN |
| EMP-008 | PRJ-002 | 2026-08-03 | 4.0 | Project | NaN |
| EMP-008 | PRJ-002 | 2026-08-04 | 4.0 | Project | NaN |
| EMP-008 | PRJ-002 | 2026-08-05 | 4.0 | Project | NaN |
| EMP-008 | PRJ-002 | 2026-08-06 | 4.0 | Project | NaN |
| EMP-008 | PRJ-002 | 2026-08-07 | 4.0 | Project | NaN |
| EMP-009 | NaN | 2026-07-14 | 6.0 | Training | NaN |
| EMP-009 | NaN | 2026-07-15 | 6.0 | Training | NaN |
| EMP-009 | NaN | 2026-07-16 | 6.0 | Training | NaN |
| EMP-009 | NaN | 2026-07-17 | 6.0 | Training | NaN |
| EMP-009 | PRJ-002 | 2026-07-20 | 6.0 | Project | NaN |
| EMP-009 | PRJ-002 | 2026-07-21 | 5.5 | Project | NaN |
| EMP-009 | PRJ-002 | 2026-07-22 | 5.5 | Project | NaN |
| EMP-009 | PRJ-002 | 2026-07-23 | 5.5 | Project | NaN |
| EMP-009 | PRJ-002 | 2026-07-24 | 5.5 | Project | NaN |
| EMP-009 | PRJ-002 | 2026-07-27 | 6.0 | Project | NaN |
| EMP-009 | PRJ-002 | 2026-07-28 | 6.5 | Project | NaN |
| EMP-009 | PRJ-002 | 2026-07-29 | 6.5 | Project | NaN |
| EMP-009 | PRJ-002 | 2026-07-30 | 6.5 | Project | NaN |
| EMP-009 | PRJ-002 | 2026-07-31 | 6.5 | Project | NaN |
| EMP-009 | PRJ-002 | 2026-08-03 | 6.0 | Project | NaN |
| EMP-009 | PRJ-002 | 2026-08-04 | 6.5 | Project | NaN |
| EMP-009 | PRJ-002 | 2026-08-05 | 6.5 | Project | NaN |
| EMP-009 | PRJ-002 | 2026-08-06 | 6.5 | Project | NaN |
| EMP-009 | PRJ-002 | 2026-08-07 | 6.5 | Project | NaN |
| EMP-010 | PRJ-001 | 2026-06-29 | 4.5 | Project | NaN |
| EMP-010 | PRJ-002 | 2026-06-29 | 4.0 | Project | NaN |
| EMP-010 | PRJ-001 | 2026-06-30 | 4.5 | Project | NaN |
| EMP-010 | PRJ-002 | 2026-06-30 | 4.0 | Project | NaN |
| EMP-010 | PRJ-001 | 2026-07-01 | 5.0 | Project | NaN |
| EMP-010 | PRJ-002 | 2026-07-01 | 4.0 | Project | NaN |
| EMP-010 | PRJ-001 | 2026-07-02 | 5.0 | Project | NaN |
| EMP-010 | PRJ-002 | 2026-07-02 | 4.0 | Project | NaN |
| EMP-010 | PRJ-001 | 2026-07-03 | 5.0 | Project | NaN |
| EMP-010 | PRJ-002 | 2026-07-03 | 4.0 | Project | NaN |
| EMP-010 | PRJ-001 | 2026-07-06 | 4.5 | Project | NaN |
| EMP-010 | PRJ-002 | 2026-07-06 | 4.0 | Project | NaN |
| EMP-010 | PRJ-001 | 2026-07-07 | 4.5 | Project | NaN |
| EMP-010 | PRJ-002 | 2026-07-07 | 4.0 | Project | NaN |
| EMP-010 | PRJ-001 | 2026-07-08 | 5.0 | Project | NaN |
| EMP-010 | PRJ-002 | 2026-07-08 | 4.0 | Project | NaN |
| EMP-010 | PRJ-001 | 2026-07-09 | 5.0 | Project | NaN |
| EMP-010 | PRJ-002 | 2026-07-09 | 4.0 | Project | NaN |
| EMP-010 | PRJ-001 | 2026-07-10 | 5.0 | Project | NaN |
| EMP-010 | PRJ-002 | 2026-07-10 | 4.0 | Project | NaN |
| EMP-010 | PRJ-001 | 2026-07-14 | 5.0 | Project | NaN |
| EMP-010 | PRJ-002 | 2026-07-14 | 4.0 | Project | NaN |
| EMP-010 | PRJ-001 | 2026-07-15 | 5.0 | Project | NaN |
| EMP-010 | PRJ-002 | 2026-07-15 | 4.0 | Project | NaN |
| EMP-010 | PRJ-001 | 2026-07-16 | 5.0 | Project | NaN |
| EMP-010 | PRJ-002 | 2026-07-16 | 4.0 | Project | NaN |
| EMP-010 | PRJ-001 | 2026-07-17 | 5.0 | Project | NaN |
| EMP-010 | PRJ-002 | 2026-07-17 | 4.0 | Project | NaN |
| EMP-010 | PRJ-001 | 2026-07-20 | 4.5 | Project | NaN |
| EMP-010 | PRJ-002 | 2026-07-20 | 4.0 | Project | NaN |
| EMP-010 | PRJ-001 | 2026-07-21 | 4.5 | Project | NaN |
| EMP-010 | PRJ-002 | 2026-07-21 | 4.0 | Project | NaN |
| EMP-010 | PRJ-001 | 2026-07-22 | 5.0 | Project | NaN |
| EMP-010 | PRJ-002 | 2026-07-22 | 4.0 | Project | NaN |
| EMP-010 | PRJ-001 | 2026-07-23 | 5.0 | Project | NaN |
| EMP-010 | PRJ-002 | 2026-07-23 | 4.0 | Project | NaN |
| EMP-010 | PRJ-001 | 2026-07-24 | 5.0 | Project | NaN |
| EMP-010 | PRJ-002 | 2026-07-24 | 4.0 | Project | NaN |
| EMP-010 | PRJ-001 | 2026-07-27 | 4.5 | Project | NaN |
| EMP-010 | PRJ-002 | 2026-07-27 | 4.0 | Project | NaN |
| EMP-010 | PRJ-001 | 2026-07-28 | 4.5 | Project | NaN |
| EMP-010 | PRJ-002 | 2026-07-28 | 4.0 | Project | NaN |
| EMP-010 | PRJ-001 | 2026-07-29 | 5.0 | Project | NaN |
| EMP-010 | PRJ-002 | 2026-07-29 | 4.0 | Project | NaN |
| EMP-010 | PRJ-001 | 2026-07-30 | 5.0 | Project | NaN |
| EMP-010 | PRJ-002 | 2026-07-30 | 4.0 | Project | NaN |
| EMP-010 | PRJ-001 | 2026-07-31 | 5.0 | Project | NaN |
| EMP-010 | PRJ-002 | 2026-07-31 | 4.0 | Project | NaN |
| EMP-010 | PRJ-001 | 2026-08-03 | 4.5 | Project | NaN |
| EMP-010 | PRJ-002 | 2026-08-03 | 4.0 | Project | NaN |
| EMP-010 | PRJ-001 | 2026-08-04 | 4.5 | Project | NaN |
| EMP-010 | PRJ-002 | 2026-08-04 | 4.0 | Project | NaN |
| EMP-010 | PRJ-001 | 2026-08-05 | 5.0 | Project | NaN |
| EMP-010 | PRJ-002 | 2026-08-05 | 4.0 | Project | NaN |
| EMP-010 | PRJ-001 | 2026-08-06 | 5.0 | Project | NaN |
| EMP-010 | PRJ-002 | 2026-08-06 | 4.0 | Project | NaN |
| EMP-010 | PRJ-001 | 2026-08-07 | 5.0 | Project | NaN |
| EMP-010 | PRJ-002 | 2026-08-07 | 4.0 | Project | NaN |
| EMP-103 | PRJ-103 | 2026-06-29 | 7.5 | Project | NaN |
| EMP-103 | PRJ-103 | 2026-06-30 | 7.5 | Project | NaN |
| EMP-103 | PRJ-103 | 2026-07-01 | 7.0 | Project | NaN |
| EMP-103 | PRJ-103 | 2026-07-02 | 7.0 | Project | NaN |
| EMP-103 | PRJ-103 | 2026-07-03 | 7.0 | Project | NaN |
| EMP-103 | PRJ-103 | 2026-07-06 | 7.5 | Project | NaN |
| EMP-103 | PRJ-103 | 2026-07-07 | 7.5 | Project | NaN |
| EMP-103 | PRJ-103 | 2026-07-08 | 7.0 | Project | NaN |
| EMP-103 | PRJ-103 | 2026-07-09 | 7.0 | Project | NaN |
| EMP-103 | PRJ-103 | 2026-07-10 | 7.0 | Project | NaN |
| EMP-103 | PRJ-103 | 2026-07-14 | 7.5 | Project | NaN |
| EMP-103 | PRJ-103 | 2026-07-15 | 7.5 | Project | NaN |
| EMP-103 | PRJ-103 | 2026-07-16 | 7.0 | Project | NaN |
| EMP-103 | PRJ-103 | 2026-07-17 | 7.0 | Project | NaN |
| EMP-103 | PRJ-103 | 2026-07-20 | 7.5 | Project | NaN |
| EMP-103 | PRJ-103 | 2026-07-21 | 7.5 | Project | NaN |
| EMP-103 | PRJ-103 | 2026-07-22 | 7.0 | Project | NaN |
| EMP-103 | PRJ-103 | 2026-07-23 | 7.0 | Project | NaN |
| EMP-103 | PRJ-103 | 2026-07-24 | 7.0 | Project | NaN |
| EMP-103 | PRJ-103 | 2026-07-27 | 7.5 | Project | NaN |
| EMP-103 | PRJ-103 | 2026-07-28 | 7.5 | Project | NaN |
| EMP-103 | PRJ-103 | 2026-07-29 | 7.0 | Project | NaN |
| EMP-103 | PRJ-103 | 2026-07-30 | 7.0 | Project | NaN |
| EMP-103 | PRJ-103 | 2026-07-31 | 7.0 | Project | NaN |
| EMP-103 | PRJ-103 | 2026-08-03 | 7.5 | Project | NaN |
| EMP-103 | PRJ-103 | 2026-08-04 | 7.5 | Project | NaN |
| EMP-103 | PRJ-103 | 2026-08-05 | 7.0 | Project | NaN |
| EMP-103 | PRJ-103 | 2026-08-06 | 7.0 | Project | NaN |
| EMP-103 | PRJ-103 | 2026-08-07 | 7.0 | Project | NaN |
| EMP-104 | PRJ-102 | 2026-06-29 | 7.0 | Project | NaN |
| EMP-104 | PRJ-102 | 2026-06-30 | 6.5 | Project | NaN |
| EMP-104 | PRJ-102 | 2026-07-01 | 6.5 | Project | NaN |
| EMP-104 | PRJ-102 | 2026-07-02 | 6.5 | Project | NaN |
| EMP-104 | PRJ-102 | 2026-07-03 | 6.5 | Project | NaN |
| EMP-104 | PRJ-102 | 2026-07-06 | 7.0 | Project | NaN |
| EMP-104 | PRJ-102 | 2026-07-07 | 6.5 | Project | NaN |
| EMP-104 | PRJ-102 | 2026-07-08 | 6.5 | Project | NaN |
| EMP-104 | PRJ-102 | 2026-07-09 | 6.5 | Project | NaN |
| EMP-104 | PRJ-102 | 2026-07-10 | 6.5 | Project | NaN |
| EMP-104 | PRJ-102 | 2026-07-14 | 7.0 | Project | NaN |
| EMP-104 | PRJ-102 | 2026-07-15 | 6.5 | Project | NaN |
| EMP-104 | PRJ-102 | 2026-07-16 | 6.5 | Project | NaN |
| EMP-104 | PRJ-102 | 2026-07-17 | 6.5 | Project | NaN |
| EMP-104 | PRJ-102 | 2026-07-20 | 7.0 | Project | NaN |
| EMP-104 | PRJ-102 | 2026-07-21 | 6.5 | Project | NaN |
| EMP-104 | PRJ-102 | 2026-07-22 | 6.5 | Project | NaN |
| EMP-104 | PRJ-102 | 2026-07-23 | 6.5 | Project | NaN |
| EMP-104 | PRJ-102 | 2026-07-24 | 6.5 | Project | NaN |
| EMP-104 | PRJ-102 | 2026-07-27 | 7.0 | Project | NaN |
| EMP-104 | PRJ-102 | 2026-07-28 | 6.5 | Project | NaN |
| EMP-104 | PRJ-102 | 2026-07-29 | 6.5 | Project | NaN |
| EMP-104 | PRJ-102 | 2026-07-30 | 6.5 | Project | NaN |
| EMP-104 | PRJ-102 | 2026-07-31 | 6.5 | Project | NaN |
| EMP-104 | PRJ-102 | 2026-08-03 | 7.0 | Project | NaN |
| EMP-104 | PRJ-102 | 2026-08-04 | 6.5 | Project | NaN |
| EMP-104 | PRJ-102 | 2026-08-05 | 6.5 | Project | NaN |
| EMP-104 | PRJ-102 | 2026-08-06 | 6.5 | Project | NaN |
| EMP-104 | PRJ-102 | 2026-08-07 | 6.5 | Project | NaN |
| EMP-105 | PRJ-106 | 2026-06-29 | 7.0 | Project | NaN |
| EMP-105 | PRJ-106 | 2026-06-30 | 6.5 | Project | NaN |
| EMP-105 | PRJ-106 | 2026-07-01 | 6.5 | Project | NaN |
| EMP-105 | PRJ-106 | 2026-07-02 | 6.5 | Project | NaN |
| EMP-105 | PRJ-106 | 2026-07-03 | 6.5 | Project | NaN |
| EMP-105 | PRJ-106 | 2026-07-06 | 7.0 | Project | NaN |
| EMP-105 | PRJ-106 | 2026-07-07 | 6.5 | Project | NaN |
| EMP-105 | PRJ-106 | 2026-07-08 | 6.5 | Project | NaN |
| EMP-105 | PRJ-106 | 2026-07-09 | 6.5 | Project | NaN |
| EMP-105 | PRJ-106 | 2026-07-10 | 6.5 | Project | NaN |
| EMP-105 | PRJ-106 | 2026-07-14 | 7.0 | Project | NaN |
| EMP-105 | PRJ-106 | 2026-07-15 | 6.5 | Project | NaN |
| EMP-105 | PRJ-106 | 2026-07-16 | 6.5 | Project | NaN |
| EMP-105 | PRJ-106 | 2026-07-17 | 6.5 | Project | NaN |
| EMP-105 | PRJ-106 | 2026-07-20 | 7.0 | Project | NaN |
| EMP-105 | PRJ-106 | 2026-07-21 | 6.5 | Project | NaN |
| EMP-105 | PRJ-106 | 2026-07-22 | 6.5 | Project | NaN |
| EMP-105 | PRJ-106 | 2026-07-23 | 6.5 | Project | NaN |
| EMP-105 | PRJ-106 | 2026-07-24 | 6.5 | Project | NaN |
| EMP-105 | PRJ-106 | 2026-07-27 | 7.0 | Project | NaN |
| EMP-105 | PRJ-106 | 2026-07-28 | 6.5 | Project | NaN |
| EMP-105 | PRJ-106 | 2026-07-29 | 6.5 | Project | NaN |
| EMP-105 | PRJ-106 | 2026-07-30 | 6.5 | Project | NaN |
| EMP-105 | PRJ-106 | 2026-07-31 | 6.5 | Project | NaN |
| EMP-105 | PRJ-106 | 2026-08-03 | 7.0 | Project | NaN |
| EMP-105 | PRJ-106 | 2026-08-04 | 6.5 | Project | NaN |
| EMP-105 | PRJ-106 | 2026-08-05 | 6.5 | Project | NaN |
| EMP-105 | PRJ-106 | 2026-08-06 | 6.5 | Project | NaN |
| EMP-105 | PRJ-106 | 2026-08-07 | 6.5 | Project | NaN |
| EMP-106 | PRJ-103 | 2026-06-29 | 7.5 | Project | NaN |
| EMP-106 | PRJ-103 | 2026-06-30 | 7.5 | Project | NaN |
| EMP-106 | PRJ-103 | 2026-07-01 | 8.0 | Project | NaN |
| EMP-106 | PRJ-103 | 2026-07-02 | 8.0 | Project | NaN |
| EMP-106 | PRJ-103 | 2026-07-03 | 8.0 | Project | NaN |
| EMP-106 | PRJ-103 | 2026-07-06 | 7.5 | Project | NaN |
| EMP-106 | PRJ-103 | 2026-07-07 | 7.5 | Project | NaN |
| EMP-106 | PRJ-103 | 2026-07-08 | 8.0 | Project | NaN |
| EMP-106 | PRJ-103 | 2026-07-09 | 8.0 | Project | NaN |
| EMP-106 | PRJ-103 | 2026-07-10 | 8.0 | Project | NaN |
| EMP-106 | PRJ-103 | 2026-07-14 | 7.5 | Project | NaN |
| EMP-106 | PRJ-103 | 2026-07-15 | 7.5 | Project | NaN |
| EMP-106 | PRJ-103 | 2026-07-16 | 8.0 | Project | NaN |
| EMP-106 | PRJ-103 | 2026-07-17 | 8.0 | Project | NaN |
| EMP-106 | PRJ-103 | 2026-07-20 | 7.5 | Project | NaN |
| EMP-106 | PRJ-103 | 2026-07-21 | 7.5 | Project | NaN |
| EMP-106 | PRJ-103 | 2026-07-22 | 8.0 | Project | NaN |
| EMP-106 | PRJ-103 | 2026-07-23 | 8.0 | Project | NaN |
| EMP-106 | PRJ-103 | 2026-07-24 | 8.0 | Project | NaN |
| EMP-106 | PRJ-103 | 2026-07-27 | 7.5 | Project | NaN |
| EMP-106 | PRJ-103 | 2026-07-28 | 7.5 | Project | NaN |
| EMP-106 | PRJ-103 | 2026-07-29 | 8.0 | Project | NaN |
| EMP-106 | PRJ-103 | 2026-07-30 | 8.0 | Project | NaN |
| EMP-106 | PRJ-103 | 2026-07-31 | 8.0 | Project | NaN |
| EMP-106 | PRJ-103 | 2026-08-03 | 7.5 | Project | NaN |
| EMP-106 | PRJ-103 | 2026-08-04 | 7.5 | Project | NaN |
| EMP-106 | PRJ-103 | 2026-08-05 | 8.0 | Project | NaN |
| EMP-106 | PRJ-103 | 2026-08-06 | 8.0 | Project | NaN |
| EMP-106 | PRJ-103 | 2026-08-07 | 8.0 | Project | NaN |
| EMP-107 | PRJ-102 | 2026-06-29 | 4.0 | Project | NaN |
| EMP-107 | PRJ-104 | 2026-06-29 | 3.0 | Project | NaN |
| EMP-107 | PRJ-102 | 2026-06-30 | 4.0 | Project | NaN |
| EMP-107 | PRJ-104 | 2026-06-30 | 3.0 | Project | NaN |
| EMP-107 | PRJ-102 | 2026-07-01 | 3.5 | Project | NaN |
| EMP-107 | PRJ-104 | 2026-07-01 | 3.5 | Project | NaN |
| EMP-107 | PRJ-102 | 2026-07-02 | 3.5 | Project | NaN |
| EMP-107 | PRJ-104 | 2026-07-02 | 3.5 | Project | NaN |
| EMP-107 | PRJ-102 | 2026-07-03 | 3.5 | Project | NaN |
| EMP-107 | PRJ-104 | 2026-07-03 | 3.5 | Project | NaN |
| EMP-107 | PRJ-102 | 2026-07-06 | 4.0 | Project | NaN |
| EMP-107 | PRJ-104 | 2026-07-06 | 3.0 | Project | NaN |
| EMP-107 | PRJ-102 | 2026-07-07 | 4.0 | Project | NaN |
| EMP-107 | PRJ-104 | 2026-07-07 | 3.0 | Project | NaN |
| EMP-107 | PRJ-102 | 2026-07-08 | 3.5 | Project | NaN |
| EMP-107 | PRJ-104 | 2026-07-08 | 3.5 | Project | NaN |
| EMP-107 | PRJ-102 | 2026-07-09 | 3.5 | Project | NaN |
| EMP-107 | PRJ-104 | 2026-07-09 | 3.5 | Project | NaN |
| EMP-107 | PRJ-102 | 2026-07-10 | 3.5 | Project | NaN |
| EMP-107 | PRJ-104 | 2026-07-10 | 3.5 | Project | NaN |
| EMP-107 | PRJ-102 | 2026-07-14 | 4.0 | Project | NaN |
| EMP-107 | PRJ-104 | 2026-07-14 | 3.5 | Project | NaN |
| EMP-107 | PRJ-102 | 2026-07-15 | 3.5 | Project | NaN |
| EMP-107 | PRJ-104 | 2026-07-15 | 3.5 | Project | NaN |
| EMP-107 | PRJ-102 | 2026-07-16 | 3.5 | Project | NaN |
| EMP-107 | PRJ-104 | 2026-07-16 | 3.0 | Project | NaN |
| EMP-107 | PRJ-102 | 2026-07-17 | 3.5 | Project | NaN |
| EMP-107 | PRJ-104 | 2026-07-17 | 3.0 | Project | NaN |
| EMP-107 | PRJ-102 | 2026-07-20 | 4.0 | Project | NaN |
| EMP-107 | PRJ-104 | 2026-07-20 | 3.0 | Project | NaN |
| EMP-107 | PRJ-102 | 2026-07-21 | 4.0 | Project | NaN |
| EMP-107 | PRJ-104 | 2026-07-21 | 3.0 | Project | NaN |
| EMP-107 | PRJ-102 | 2026-07-22 | 3.5 | Project | NaN |
| EMP-107 | PRJ-104 | 2026-07-22 | 3.5 | Project | NaN |
| EMP-107 | PRJ-102 | 2026-07-23 | 3.5 | Project | NaN |
| EMP-107 | PRJ-104 | 2026-07-23 | 3.5 | Project | NaN |
| EMP-107 | PRJ-102 | 2026-07-24 | 3.5 | Project | NaN |
| EMP-107 | PRJ-104 | 2026-07-24 | 3.5 | Project | NaN |
| EMP-107 | PRJ-102 | 2026-07-27 | 4.0 | Project | NaN |
| EMP-107 | PRJ-104 | 2026-07-27 | 3.0 | Project | NaN |
| EMP-107 | PRJ-102 | 2026-07-28 | 4.0 | Project | NaN |
| EMP-107 | PRJ-104 | 2026-07-28 | 3.0 | Project | NaN |
| EMP-107 | PRJ-102 | 2026-07-29 | 3.5 | Project | NaN |
| EMP-107 | PRJ-104 | 2026-07-29 | 3.5 | Project | NaN |
| EMP-107 | PRJ-102 | 2026-07-30 | 3.5 | Project | NaN |
| EMP-107 | PRJ-104 | 2026-07-30 | 3.5 | Project | NaN |
| EMP-107 | PRJ-102 | 2026-07-31 | 3.5 | Project | NaN |
| EMP-107 | PRJ-104 | 2026-07-31 | 3.5 | Project | NaN |
| EMP-107 | PRJ-102 | 2026-08-03 | 4.0 | Project | NaN |
| EMP-107 | PRJ-104 | 2026-08-03 | 3.0 | Project | NaN |
| EMP-107 | PRJ-102 | 2026-08-04 | 4.0 | Project | NaN |
| EMP-107 | PRJ-104 | 2026-08-04 | 3.0 | Project | NaN |
| EMP-107 | PRJ-102 | 2026-08-05 | 3.5 | Project | NaN |
| EMP-107 | PRJ-104 | 2026-08-05 | 3.5 | Project | NaN |
| EMP-107 | PRJ-102 | 2026-08-06 | 3.5 | Project | NaN |
| EMP-107 | PRJ-104 | 2026-08-06 | 3.5 | Project | NaN |
| EMP-107 | PRJ-102 | 2026-08-07 | 3.5 | Project | NaN |
| EMP-107 | PRJ-104 | 2026-08-07 | 3.5 | Project | NaN |
| EMP-108 | PRJ-102 | 2026-06-29 | 3.5 | Project | NaN |
| EMP-108 | PRJ-103 | 2026-06-29 | 3.0 | Project | NaN |
| EMP-108 | PRJ-102 | 2026-06-30 | 4.0 | Project | NaN |
| EMP-108 | PRJ-103 | 2026-06-30 | 3.0 | Project | NaN |
| EMP-108 | PRJ-102 | 2026-07-01 | 4.0 | Project | NaN |
| EMP-108 | PRJ-103 | 2026-07-01 | 3.0 | Project | NaN |
| EMP-108 | PRJ-102 | 2026-07-02 | 4.0 | Project | NaN |
| EMP-108 | PRJ-103 | 2026-07-02 | 3.0 | Project | NaN |
| EMP-108 | PRJ-102 | 2026-07-03 | 4.0 | Project | NaN |
| EMP-108 | PRJ-103 | 2026-07-03 | 3.0 | Project | NaN |
| EMP-108 | PRJ-102 | 2026-07-06 | 3.5 | Project | NaN |
| EMP-108 | PRJ-103 | 2026-07-06 | 3.0 | Project | NaN |
| EMP-108 | PRJ-102 | 2026-07-07 | 4.0 | Project | NaN |
| EMP-108 | PRJ-103 | 2026-07-07 | 3.0 | Project | NaN |
| EMP-108 | PRJ-102 | 2026-07-08 | 4.0 | Project | NaN |
| EMP-108 | PRJ-103 | 2026-07-08 | 3.0 | Project | NaN |
| EMP-108 | PRJ-102 | 2026-07-09 | 4.0 | Project | NaN |
| EMP-108 | PRJ-103 | 2026-07-09 | 3.0 | Project | NaN |
| EMP-108 | PRJ-102 | 2026-07-10 | 4.0 | Project | NaN |
| EMP-108 | PRJ-103 | 2026-07-10 | 3.0 | Project | NaN |
| EMP-108 | PRJ-102 | 2026-07-14 | 3.5 | Project | NaN |
| EMP-108 | PRJ-103 | 2026-07-14 | 3.0 | Project | NaN |
| EMP-108 | PRJ-102 | 2026-07-15 | 4.0 | Project | NaN |
| EMP-108 | PRJ-103 | 2026-07-15 | 3.0 | Project | NaN |
| EMP-108 | PRJ-102 | 2026-07-16 | 4.0 | Project | NaN |
| EMP-108 | PRJ-103 | 2026-07-16 | 3.0 | Project | NaN |
| EMP-108 | PRJ-102 | 2026-07-17 | 4.0 | Project | NaN |
| EMP-108 | PRJ-103 | 2026-07-17 | 3.0 | Project | NaN |
| EMP-108 | PRJ-102 | 2026-07-20 | 3.5 | Project | NaN |
| EMP-108 | PRJ-103 | 2026-07-20 | 3.0 | Project | NaN |
| EMP-108 | PRJ-102 | 2026-07-21 | 4.0 | Project | NaN |
| EMP-108 | PRJ-103 | 2026-07-21 | 3.0 | Project | NaN |
| EMP-108 | PRJ-102 | 2026-07-22 | 4.0 | Project | NaN |
| EMP-108 | PRJ-103 | 2026-07-22 | 3.0 | Project | NaN |
| EMP-108 | PRJ-102 | 2026-07-23 | 4.0 | Project | NaN |
| EMP-108 | PRJ-103 | 2026-07-23 | 3.0 | Project | NaN |
| EMP-108 | PRJ-102 | 2026-07-24 | 4.0 | Project | NaN |
| EMP-108 | PRJ-103 | 2026-07-24 | 3.0 | Project | NaN |
| EMP-108 | PRJ-102 | 2026-07-27 | 3.5 | Project | NaN |
| EMP-108 | PRJ-103 | 2026-07-27 | 3.0 | Project | NaN |
| EMP-108 | PRJ-102 | 2026-07-28 | 4.0 | Project | NaN |
| EMP-108 | PRJ-103 | 2026-07-28 | 3.0 | Project | NaN |
| EMP-108 | PRJ-102 | 2026-07-29 | 4.0 | Project | NaN |
| EMP-108 | PRJ-103 | 2026-07-29 | 3.0 | Project | NaN |
| EMP-108 | PRJ-102 | 2026-07-30 | 4.0 | Project | NaN |
| EMP-108 | PRJ-103 | 2026-07-30 | 3.0 | Project | NaN |
| EMP-108 | PRJ-102 | 2026-07-31 | 4.0 | Project | NaN |
| EMP-108 | PRJ-103 | 2026-07-31 | 3.0 | Project | NaN |
| EMP-108 | PRJ-102 | 2026-08-03 | 3.5 | Project | NaN |
| EMP-108 | PRJ-103 | 2026-08-03 | 3.0 | Project | NaN |
| EMP-108 | PRJ-102 | 2026-08-04 | 4.0 | Project | NaN |
| EMP-108 | PRJ-103 | 2026-08-04 | 3.0 | Project | NaN |
| EMP-108 | PRJ-102 | 2026-08-05 | 4.0 | Project | NaN |
| EMP-108 | PRJ-103 | 2026-08-05 | 3.0 | Project | NaN |
| EMP-108 | PRJ-102 | 2026-08-06 | 4.0 | Project | NaN |
| EMP-108 | PRJ-103 | 2026-08-06 | 3.0 | Project | NaN |
| EMP-108 | PRJ-102 | 2026-08-07 | 4.0 | Project | NaN |
| EMP-108 | PRJ-103 | 2026-08-07 | 3.0 | Project | NaN |
| EMP-109 | PRJ-108 | 2026-06-29 | 8.5 | Project | NaN |
| EMP-109 | PRJ-108 | 2026-06-30 | 8.0 | Project | NaN |
| EMP-109 | PRJ-108 | 2026-07-01 | 8.0 | Project | NaN |
| EMP-109 | PRJ-108 | 2026-07-02 | 8.0 | Project | NaN |
| EMP-109 | PRJ-108 | 2026-07-03 | 8.0 | Project | NaN |
| EMP-109 | PRJ-108 | 2026-07-06 | 8.5 | Project | NaN |
| EMP-109 | PRJ-108 | 2026-07-07 | 8.0 | Project | NaN |
| EMP-109 | PRJ-108 | 2026-07-08 | 8.0 | Project | NaN |
| EMP-109 | PRJ-108 | 2026-07-09 | 8.0 | Project | NaN |
| EMP-109 | PRJ-108 | 2026-07-10 | 8.0 | Project | NaN |
| EMP-109 | PRJ-108 | 2026-07-14 | 8.0 | Project | NaN |
| EMP-109 | PRJ-108 | 2026-07-15 | 8.0 | Project | NaN |
| EMP-109 | PRJ-108 | 2026-07-16 | 8.0 | Project | NaN |
| EMP-109 | PRJ-108 | 2026-07-17 | 8.0 | Project | NaN |
| EMP-109 | PRJ-108 | 2026-07-20 | 8.5 | Project | NaN |
| EMP-109 | PRJ-108 | 2026-07-21 | 8.0 | Project | NaN |
| EMP-109 | PRJ-108 | 2026-07-22 | 8.0 | Project | NaN |
| EMP-109 | PRJ-108 | 2026-07-23 | 8.0 | Project | NaN |
| EMP-109 | PRJ-108 | 2026-07-24 | 8.0 | Project | NaN |
| EMP-109 | PRJ-108 | 2026-07-27 | 8.5 | Project | NaN |
| EMP-109 | PRJ-108 | 2026-07-28 | 8.0 | Project | NaN |
| EMP-109 | PRJ-108 | 2026-07-29 | 8.0 | Project | NaN |
| EMP-109 | PRJ-108 | 2026-07-30 | 8.0 | Project | NaN |
| EMP-109 | PRJ-108 | 2026-07-31 | 8.0 | Project | NaN |
| EMP-109 | PRJ-108 | 2026-08-03 | 8.5 | Project | NaN |
| EMP-109 | PRJ-108 | 2026-08-04 | 8.0 | Project | NaN |
| EMP-109 | PRJ-108 | 2026-08-05 | 8.0 | Project | NaN |
| EMP-109 | PRJ-108 | 2026-08-06 | 8.0 | Project | NaN |
| EMP-109 | PRJ-108 | 2026-08-07 | 8.0 | Project | NaN |
| EMP-110 | PRJ-101 | 2026-06-29 | 4.5 | Project | NaN |
| EMP-110 | PRJ-105 | 2026-06-29 | 3.0 | Project | NaN |
| EMP-110 | PRJ-101 | 2026-06-30 | 4.5 | Project | NaN |
| EMP-110 | PRJ-105 | 2026-06-30 | 3.0 | Project | NaN |
| EMP-110 | PRJ-101 | 2026-07-01 | 4.0 | Project | NaN |
| EMP-110 | PRJ-105 | 2026-07-01 | 3.0 | Project | NaN |
| EMP-110 | PRJ-101 | 2026-07-02 | 4.0 | Project | NaN |
| EMP-110 | PRJ-105 | 2026-07-02 | 3.0 | Project | NaN |
| EMP-110 | PRJ-101 | 2026-07-03 | 4.0 | Project | NaN |
| EMP-110 | PRJ-105 | 2026-07-03 | 3.0 | Project | NaN |
| EMP-110 | PRJ-101 | 2026-07-06 | 4.5 | Project | NaN |
| EMP-110 | PRJ-105 | 2026-07-06 | 3.0 | Project | NaN |
| EMP-110 | PRJ-101 | 2026-07-07 | 4.5 | Project | NaN |
| EMP-110 | PRJ-105 | 2026-07-07 | 3.0 | Project | NaN |
| EMP-110 | PRJ-101 | 2026-07-08 | 4.0 | Project | NaN |
| EMP-110 | PRJ-105 | 2026-07-08 | 3.0 | Project | NaN |
| EMP-110 | PRJ-101 | 2026-07-09 | 4.0 | Project | NaN |
| EMP-110 | PRJ-105 | 2026-07-09 | 3.0 | Project | NaN |
| EMP-110 | PRJ-101 | 2026-07-10 | 4.0 | Project | NaN |
| EMP-110 | PRJ-105 | 2026-07-10 | 3.0 | Project | NaN |
| EMP-110 | PRJ-101 | 2026-07-14 | 4.5 | Project | NaN |
| EMP-110 | PRJ-105 | 2026-07-14 | 3.0 | Project | NaN |
| EMP-110 | PRJ-101 | 2026-07-15 | 4.5 | Project | NaN |
| EMP-110 | PRJ-105 | 2026-07-15 | 3.0 | Project | NaN |
| EMP-110 | PRJ-101 | 2026-07-16 | 4.0 | Project | NaN |
| EMP-110 | PRJ-105 | 2026-07-16 | 3.0 | Project | NaN |
| EMP-110 | PRJ-101 | 2026-07-17 | 4.0 | Project | NaN |
| EMP-110 | PRJ-105 | 2026-07-17 | 3.0 | Project | NaN |
| EMP-110 | PRJ-101 | 2026-07-20 | 4.5 | Project | NaN |
| EMP-110 | PRJ-105 | 2026-07-20 | 3.0 | Project | NaN |
| EMP-110 | PRJ-101 | 2026-07-21 | 4.5 | Project | NaN |
| EMP-110 | PRJ-105 | 2026-07-21 | 3.0 | Project | NaN |
| EMP-110 | PRJ-101 | 2026-07-22 | 4.0 | Project | NaN |
| EMP-110 | PRJ-105 | 2026-07-22 | 3.0 | Project | NaN |
| EMP-110 | PRJ-101 | 2026-07-23 | 4.0 | Project | NaN |
| EMP-110 | PRJ-105 | 2026-07-23 | 3.0 | Project | NaN |
| EMP-110 | PRJ-101 | 2026-07-24 | 4.0 | Project | NaN |
| EMP-110 | PRJ-105 | 2026-07-24 | 3.0 | Project | NaN |
| EMP-110 | PRJ-101 | 2026-07-27 | 4.5 | Project | NaN |
| EMP-110 | PRJ-105 | 2026-07-27 | 3.0 | Project | NaN |
| EMP-110 | PRJ-101 | 2026-07-28 | 4.5 | Project | NaN |
| EMP-110 | PRJ-105 | 2026-07-28 | 3.0 | Project | NaN |
| EMP-110 | PRJ-101 | 2026-07-29 | 4.0 | Project | NaN |
| EMP-110 | PRJ-105 | 2026-07-29 | 3.0 | Project | NaN |
| EMP-110 | PRJ-101 | 2026-07-30 | 4.0 | Project | NaN |
| EMP-110 | PRJ-105 | 2026-07-30 | 3.0 | Project | NaN |
| EMP-110 | PRJ-101 | 2026-07-31 | 4.0 | Project | NaN |
| EMP-110 | PRJ-105 | 2026-07-31 | 3.0 | Project | NaN |
| EMP-110 | PRJ-101 | 2026-08-03 | 4.5 | Project | NaN |
| EMP-110 | PRJ-105 | 2026-08-03 | 3.0 | Project | NaN |
| EMP-110 | PRJ-101 | 2026-08-04 | 4.5 | Project | NaN |
| EMP-110 | PRJ-105 | 2026-08-04 | 3.0 | Project | NaN |
| EMP-110 | PRJ-101 | 2026-08-05 | 4.0 | Project | NaN |
| EMP-110 | PRJ-105 | 2026-08-05 | 3.0 | Project | NaN |
| EMP-110 | PRJ-101 | 2026-08-06 | 4.0 | Project | NaN |
| EMP-110 | PRJ-105 | 2026-08-06 | 3.0 | Project | NaN |
| EMP-110 | PRJ-101 | 2026-08-07 | 4.0 | Project | NaN |
| EMP-110 | PRJ-105 | 2026-08-07 | 3.0 | Project | NaN |
| EMP-111 | PRJ-105 | 2026-06-29 | 8.0 | Project | NaN |
| EMP-111 | PRJ-105 | 2026-06-30 | 7.5 | Project | NaN |
| EMP-111 | PRJ-105 | 2026-07-01 | 7.5 | Project | NaN |
| EMP-111 | PRJ-105 | 2026-07-02 | 7.5 | Project | NaN |
| EMP-111 | PRJ-105 | 2026-07-03 | 7.5 | Project | NaN |
| EMP-111 | PRJ-105 | 2026-07-06 | 8.0 | Project | NaN |
| EMP-111 | PRJ-105 | 2026-07-07 | 7.5 | Project | NaN |
| EMP-111 | PRJ-105 | 2026-07-08 | 7.5 | Project | NaN |
| EMP-111 | PRJ-105 | 2026-07-09 | 7.5 | Project | NaN |
| EMP-111 | PRJ-105 | 2026-07-10 | 7.5 | Project | NaN |
| EMP-111 | PRJ-105 | 2026-07-14 | 8.0 | Project | NaN |
| EMP-111 | PRJ-105 | 2026-07-15 | 7.5 | Project | NaN |
| EMP-111 | PRJ-105 | 2026-07-16 | 7.5 | Project | NaN |
| EMP-111 | PRJ-105 | 2026-07-17 | 7.5 | Project | NaN |
| EMP-111 | PRJ-105 | 2026-07-20 | 8.0 | Project | NaN |
| EMP-111 | PRJ-105 | 2026-07-21 | 7.5 | Project | NaN |
| EMP-111 | PRJ-105 | 2026-07-22 | 7.5 | Project | NaN |
| EMP-111 | PRJ-105 | 2026-07-23 | 7.5 | Project | NaN |
| EMP-111 | PRJ-105 | 2026-07-24 | 7.5 | Project | NaN |
| EMP-111 | PRJ-105 | 2026-07-27 | 8.0 | Project | NaN |
| EMP-111 | PRJ-105 | 2026-07-28 | 7.5 | Project | NaN |
| EMP-111 | PRJ-105 | 2026-07-29 | 7.5 | Project | NaN |
| EMP-111 | PRJ-105 | 2026-07-30 | 7.5 | Project | NaN |
| EMP-111 | PRJ-105 | 2026-07-31 | 7.5 | Project | NaN |
| EMP-111 | PRJ-105 | 2026-08-03 | 8.0 | Project | NaN |
| EMP-111 | PRJ-105 | 2026-08-04 | 7.5 | Project | NaN |
| EMP-111 | PRJ-105 | 2026-08-05 | 7.5 | Project | NaN |
| EMP-111 | PRJ-105 | 2026-08-06 | 7.5 | Project | NaN |
| EMP-111 | PRJ-105 | 2026-08-07 | 7.5 | Project | NaN |
| EMP-112 | PRJ-102 | 2026-06-29 | 5.0 | Project | NaN |
| EMP-112 | PRJ-105 | 2026-06-29 | 4.0 | Project | NaN |
| EMP-112 | PRJ-102 | 2026-06-30 | 5.0 | Project | NaN |
| EMP-112 | PRJ-105 | 2026-06-30 | 3.5 | Project | NaN |
| EMP-112 | PRJ-102 | 2026-07-01 | 4.5 | Project | NaN |
| EMP-112 | PRJ-105 | 2026-07-01 | 3.5 | Project | NaN |
| EMP-112 | PRJ-102 | 2026-07-02 | 4.5 | Project | NaN |
| EMP-112 | PRJ-105 | 2026-07-02 | 3.5 | Project | NaN |
| EMP-112 | PRJ-102 | 2026-07-03 | 4.5 | Project | NaN |
| EMP-112 | PRJ-105 | 2026-07-03 | 3.5 | Project | NaN |
| EMP-112 | PRJ-102 | 2026-07-06 | 5.0 | Project | NaN |
| EMP-112 | PRJ-105 | 2026-07-06 | 4.0 | Project | NaN |
| EMP-112 | PRJ-102 | 2026-07-07 | 5.0 | Project | NaN |
| EMP-112 | PRJ-105 | 2026-07-07 | 3.5 | Project | NaN |
| EMP-112 | PRJ-102 | 2026-07-08 | 4.5 | Project | NaN |
| EMP-112 | PRJ-105 | 2026-07-08 | 3.5 | Project | NaN |
| EMP-112 | PRJ-102 | 2026-07-09 | 4.5 | Project | NaN |
| EMP-112 | PRJ-105 | 2026-07-09 | 3.5 | Project | NaN |
| EMP-112 | PRJ-102 | 2026-07-10 | 4.5 | Project | NaN |
| EMP-112 | PRJ-105 | 2026-07-10 | 3.5 | Project | NaN |
| EMP-112 | PRJ-102 | 2026-07-14 | 5.0 | Project | NaN |
| EMP-112 | PRJ-105 | 2026-07-14 | 4.0 | Project | NaN |
| EMP-112 | PRJ-102 | 2026-07-15 | 4.5 | Project | NaN |
| EMP-112 | PRJ-105 | 2026-07-15 | 3.5 | Project | NaN |
| EMP-112 | PRJ-102 | 2026-07-16 | 4.5 | Project | NaN |
| EMP-112 | PRJ-105 | 2026-07-16 | 3.5 | Project | NaN |
| EMP-112 | PRJ-102 | 2026-07-17 | 4.5 | Project | NaN |
| EMP-112 | PRJ-105 | 2026-07-17 | 3.5 | Project | NaN |
| EMP-112 | PRJ-102 | 2026-07-20 | 5.0 | Project | NaN |
| EMP-112 | PRJ-105 | 2026-07-20 | 4.0 | Project | NaN |
| EMP-112 | PRJ-102 | 2026-07-21 | 5.0 | Project | NaN |
| EMP-112 | PRJ-105 | 2026-07-21 | 3.5 | Project | NaN |
| EMP-112 | PRJ-102 | 2026-07-22 | 4.5 | Project | NaN |
| EMP-112 | PRJ-105 | 2026-07-22 | 3.5 | Project | NaN |
| EMP-112 | PRJ-102 | 2026-07-23 | 4.5 | Project | NaN |
| EMP-112 | PRJ-105 | 2026-07-23 | 3.5 | Project | NaN |
| EMP-112 | PRJ-102 | 2026-07-24 | 4.5 | Project | NaN |
| EMP-112 | PRJ-105 | 2026-07-24 | 3.5 | Project | NaN |
| EMP-112 | PRJ-102 | 2026-07-27 | 5.0 | Project | NaN |
| EMP-112 | PRJ-105 | 2026-07-27 | 4.0 | Project | NaN |
| EMP-112 | PRJ-102 | 2026-07-28 | 5.0 | Project | NaN |
| EMP-112 | PRJ-105 | 2026-07-28 | 3.5 | Project | NaN |
| EMP-112 | PRJ-102 | 2026-07-29 | 4.5 | Project | NaN |
| EMP-112 | PRJ-105 | 2026-07-29 | 3.5 | Project | NaN |
| EMP-112 | PRJ-102 | 2026-07-30 | 4.5 | Project | NaN |
| EMP-112 | PRJ-105 | 2026-07-30 | 3.5 | Project | NaN |
| EMP-112 | PRJ-102 | 2026-07-31 | 4.5 | Project | NaN |
| EMP-112 | PRJ-105 | 2026-07-31 | 3.5 | Project | NaN |
| EMP-112 | PRJ-102 | 2026-08-03 | 5.0 | Project | NaN |
| EMP-112 | PRJ-105 | 2026-08-03 | 4.0 | Project | NaN |
| EMP-112 | PRJ-102 | 2026-08-04 | 5.0 | Project | NaN |
| EMP-112 | PRJ-105 | 2026-08-04 | 3.5 | Project | NaN |
| EMP-112 | PRJ-102 | 2026-08-05 | 4.5 | Project | NaN |
| EMP-112 | PRJ-105 | 2026-08-05 | 3.5 | Project | NaN |
| EMP-112 | PRJ-102 | 2026-08-06 | 4.5 | Project | NaN |
| EMP-112 | PRJ-105 | 2026-08-06 | 3.5 | Project | NaN |
| EMP-112 | PRJ-102 | 2026-08-07 | 4.5 | Project | NaN |
| EMP-112 | PRJ-105 | 2026-08-07 | 3.5 | Project | NaN |
| EMP-113 | PRJ-106 | 2026-06-29 | 3.0 | Project | NaN |
| EMP-113 | PRJ-106 | 2026-06-30 | 3.5 | Project | NaN |
| EMP-113 | PRJ-106 | 2026-07-01 | 3.5 | Project | NaN |
| EMP-113 | PRJ-106 | 2026-07-02 | 3.5 | Project | NaN |
| EMP-113 | PRJ-106 | 2026-07-03 | 3.5 | Project | NaN |
| EMP-113 | PRJ-106 | 2026-07-06 | 3.0 | Project | NaN |
| EMP-113 | PRJ-106 | 2026-07-07 | 3.5 | Project | NaN |
| EMP-113 | PRJ-106 | 2026-07-08 | 3.5 | Project | NaN |
| EMP-113 | PRJ-106 | 2026-07-09 | 3.5 | Project | NaN |
| EMP-113 | PRJ-106 | 2026-07-10 | 3.5 | Project | NaN |
| EMP-113 | PRJ-106 | 2026-07-14 | 3.0 | Project | NaN |
| EMP-113 | PRJ-106 | 2026-07-15 | 3.5 | Project | NaN |
| EMP-113 | PRJ-106 | 2026-07-16 | 3.5 | Project | NaN |
| EMP-113 | PRJ-106 | 2026-07-17 | 3.5 | Project | NaN |
| EMP-113 | PRJ-106 | 2026-07-20 | 3.0 | Project | NaN |
| EMP-113 | PRJ-106 | 2026-07-21 | 3.5 | Project | NaN |
| EMP-113 | PRJ-106 | 2026-07-22 | 3.5 | Project | NaN |
| EMP-113 | PRJ-106 | 2026-07-23 | 3.5 | Project | NaN |
| EMP-113 | PRJ-106 | 2026-07-24 | 3.5 | Project | NaN |
| EMP-113 | PRJ-106 | 2026-07-27 | 3.0 | Project | NaN |
| EMP-113 | PRJ-106 | 2026-07-28 | 3.5 | Project | NaN |
| EMP-113 | PRJ-106 | 2026-07-29 | 3.5 | Project | NaN |
| EMP-113 | PRJ-106 | 2026-07-30 | 3.5 | Project | NaN |
| EMP-113 | PRJ-106 | 2026-07-31 | 3.5 | Project | NaN |
| EMP-113 | PRJ-106 | 2026-08-03 | 3.0 | Project | NaN |
| EMP-113 | PRJ-106 | 2026-08-04 | 3.5 | Project | NaN |
| EMP-113 | PRJ-106 | 2026-08-05 | 3.5 | Project | NaN |
| EMP-113 | PRJ-106 | 2026-08-06 | 3.5 | Project | NaN |
| EMP-113 | PRJ-106 | 2026-08-07 | 3.5 | Project | NaN |
| EMP-114 | PRJ-102 | 2026-06-29 | 2.0 | Project | NaN |
| EMP-114 | PRJ-108 | 2026-06-29 | 1.5 | Project | NaN |
| EMP-114 | PRJ-102 | 2026-06-30 | 2.0 | Project | NaN |
| EMP-114 | PRJ-108 | 2026-06-30 | 1.5 | Project | NaN |
| EMP-114 | PRJ-102 | 2026-07-01 | 1.5 | Project | NaN |
| EMP-114 | PRJ-108 | 2026-07-01 | 2.0 | Project | NaN |
| EMP-114 | PRJ-102 | 2026-07-02 | 1.5 | Project | NaN |
| EMP-114 | PRJ-108 | 2026-07-02 | 2.0 | Project | NaN |
| EMP-114 | PRJ-102 | 2026-07-03 | 1.5 | Project | NaN |
| EMP-114 | PRJ-108 | 2026-07-03 | 2.0 | Project | NaN |
| EMP-114 | PRJ-102 | 2026-07-06 | 2.0 | Project | NaN |
| EMP-114 | PRJ-108 | 2026-07-06 | 1.5 | Project | NaN |
| EMP-114 | PRJ-102 | 2026-07-07 | 2.0 | Project | NaN |
| EMP-114 | PRJ-108 | 2026-07-07 | 1.5 | Project | NaN |
| EMP-114 | PRJ-102 | 2026-07-08 | 1.5 | Project | NaN |
| EMP-114 | PRJ-108 | 2026-07-08 | 2.0 | Project | NaN |
| EMP-114 | PRJ-102 | 2026-07-09 | 1.5 | Project | NaN |
| EMP-114 | PRJ-108 | 2026-07-09 | 2.0 | Project | NaN |
| EMP-114 | PRJ-102 | 2026-07-10 | 1.5 | Project | NaN |
| EMP-114 | PRJ-108 | 2026-07-10 | 2.0 | Project | NaN |
| EMP-114 | PRJ-102 | 2026-07-14 | 1.5 | Project | NaN |
| EMP-114 | PRJ-108 | 2026-07-14 | 1.5 | Project | NaN |
| EMP-114 | PRJ-102 | 2026-07-15 | 1.5 | Project | NaN |
| EMP-114 | PRJ-108 | 2026-07-15 | 1.5 | Project | NaN |
| EMP-114 | PRJ-102 | 2026-07-16 | 2.0 | Project | NaN |
| EMP-114 | PRJ-108 | 2026-07-16 | 2.0 | Project | NaN |
| EMP-114 | PRJ-102 | 2026-07-17 | 2.0 | Project | NaN |
| EMP-114 | PRJ-108 | 2026-07-17 | 2.0 | Project | NaN |
| EMP-114 | PRJ-102 | 2026-07-20 | 2.0 | Project | NaN |
| EMP-114 | PRJ-108 | 2026-07-20 | 1.5 | Project | NaN |
| EMP-114 | PRJ-102 | 2026-07-21 | 2.0 | Project | NaN |
| EMP-114 | PRJ-108 | 2026-07-21 | 1.5 | Project | NaN |
| EMP-114 | PRJ-102 | 2026-07-22 | 1.5 | Project | NaN |
| EMP-114 | PRJ-108 | 2026-07-22 | 2.0 | Project | NaN |
| EMP-114 | PRJ-102 | 2026-07-23 | 1.5 | Project | NaN |
| EMP-114 | PRJ-108 | 2026-07-23 | 2.0 | Project | NaN |
| EMP-114 | PRJ-102 | 2026-07-24 | 1.5 | Project | NaN |
| EMP-114 | PRJ-108 | 2026-07-24 | 2.0 | Project | NaN |
| EMP-114 | PRJ-102 | 2026-07-27 | 2.0 | Project | NaN |
| EMP-114 | PRJ-108 | 2026-07-27 | 1.5 | Project | NaN |
| EMP-114 | PRJ-102 | 2026-07-28 | 2.0 | Project | NaN |
| EMP-114 | PRJ-108 | 2026-07-28 | 1.5 | Project | NaN |
| EMP-114 | PRJ-102 | 2026-07-29 | 1.5 | Project | NaN |
| EMP-114 | PRJ-108 | 2026-07-29 | 2.0 | Project | NaN |
| EMP-114 | PRJ-102 | 2026-07-30 | 1.5 | Project | NaN |
| EMP-114 | PRJ-108 | 2026-07-30 | 2.0 | Project | NaN |
| EMP-114 | PRJ-102 | 2026-07-31 | 1.5 | Project | NaN |
| EMP-114 | PRJ-108 | 2026-07-31 | 2.0 | Project | NaN |
| EMP-114 | PRJ-102 | 2026-08-03 | 2.0 | Project | NaN |
| EMP-114 | PRJ-108 | 2026-08-03 | 1.5 | Project | NaN |
| EMP-114 | PRJ-102 | 2026-08-04 | 2.0 | Project | NaN |
| EMP-114 | PRJ-108 | 2026-08-04 | 1.5 | Project | NaN |
| EMP-114 | PRJ-102 | 2026-08-05 | 1.5 | Project | NaN |
| EMP-114 | PRJ-108 | 2026-08-05 | 2.0 | Project | NaN |
| EMP-114 | PRJ-102 | 2026-08-06 | 1.5 | Project | NaN |
| EMP-114 | PRJ-108 | 2026-08-06 | 2.0 | Project | NaN |
| EMP-114 | PRJ-102 | 2026-08-07 | 1.5 | Project | NaN |
| EMP-114 | PRJ-108 | 2026-08-07 | 2.0 | Project | NaN |
| EMP-115 | PRJ-102 | 2026-06-29 | 5.0 | Project | NaN |
| EMP-115 | PRJ-105 | 2026-06-29 | 2.5 | Project | NaN |
| EMP-115 | PRJ-102 | 2026-06-30 | 5.0 | Project | NaN |
| EMP-115 | PRJ-105 | 2026-06-30 | 2.5 | Project | NaN |
| EMP-115 | PRJ-102 | 2026-07-01 | 5.0 | Project | NaN |
| EMP-115 | PRJ-105 | 2026-07-01 | 2.5 | Project | NaN |
| EMP-115 | PRJ-102 | 2026-07-02 | 5.0 | Project | NaN |
| EMP-115 | PRJ-105 | 2026-07-02 | 2.5 | Project | NaN |
| EMP-115 | PRJ-102 | 2026-07-03 | 5.0 | Project | NaN |
| EMP-115 | PRJ-105 | 2026-07-03 | 2.5 | Project | NaN |
| EMP-115 | PRJ-102 | 2026-07-06 | 5.0 | Project | NaN |
| EMP-115 | PRJ-105 | 2026-07-06 | 2.5 | Project | NaN |
| EMP-115 | PRJ-102 | 2026-07-07 | 5.0 | Project | NaN |
| EMP-115 | PRJ-105 | 2026-07-07 | 2.5 | Project | NaN |
| EMP-115 | PRJ-102 | 2026-07-08 | 5.0 | Project | NaN |
| EMP-115 | PRJ-105 | 2026-07-08 | 2.5 | Project | NaN |
| EMP-115 | PRJ-102 | 2026-07-09 | 5.0 | Project | NaN |
| EMP-115 | PRJ-105 | 2026-07-09 | 2.5 | Project | NaN |
| EMP-115 | PRJ-102 | 2026-07-10 | 5.0 | Project | NaN |
| EMP-115 | PRJ-105 | 2026-07-10 | 2.5 | Project | NaN |
| EMP-115 | PRJ-102 | 2026-07-14 | 5.0 | Project | NaN |
| EMP-115 | PRJ-105 | 2026-07-14 | 2.5 | Project | NaN |
| EMP-115 | PRJ-102 | 2026-07-15 | 5.0 | Project | NaN |
| EMP-115 | PRJ-105 | 2026-07-15 | 2.5 | Project | NaN |
| EMP-115 | PRJ-102 | 2026-07-16 | 5.0 | Project | NaN |
| EMP-115 | PRJ-105 | 2026-07-16 | 2.5 | Project | NaN |
| EMP-115 | PRJ-102 | 2026-07-17 | 5.0 | Project | NaN |
| EMP-115 | PRJ-105 | 2026-07-17 | 2.5 | Project | NaN |
| EMP-115 | PRJ-102 | 2026-07-20 | 5.0 | Project | NaN |
| EMP-115 | PRJ-105 | 2026-07-20 | 2.5 | Project | NaN |
| EMP-115 | PRJ-102 | 2026-07-21 | 5.0 | Project | NaN |
| EMP-115 | PRJ-105 | 2026-07-21 | 2.5 | Project | NaN |
| EMP-115 | PRJ-102 | 2026-07-22 | 5.0 | Project | NaN |
| EMP-115 | PRJ-105 | 2026-07-22 | 2.5 | Project | NaN |
| EMP-115 | PRJ-102 | 2026-07-23 | 5.0 | Project | NaN |
| EMP-115 | PRJ-105 | 2026-07-23 | 2.5 | Project | NaN |
| EMP-115 | PRJ-102 | 2026-07-24 | 5.0 | Project | NaN |
| EMP-115 | PRJ-105 | 2026-07-24 | 2.5 | Project | NaN |
| EMP-115 | PRJ-102 | 2026-07-27 | 5.0 | Project | NaN |
| EMP-115 | PRJ-105 | 2026-07-27 | 2.5 | Project | NaN |
| EMP-115 | PRJ-102 | 2026-07-28 | 5.0 | Project | NaN |
| EMP-115 | PRJ-105 | 2026-07-28 | 2.5 | Project | NaN |
| EMP-115 | PRJ-102 | 2026-07-29 | 5.0 | Project | NaN |
| EMP-115 | PRJ-105 | 2026-07-29 | 2.5 | Project | NaN |
| EMP-115 | PRJ-102 | 2026-07-30 | 5.0 | Project | NaN |
| EMP-115 | PRJ-105 | 2026-07-30 | 2.5 | Project | NaN |
| EMP-115 | PRJ-102 | 2026-07-31 | 5.0 | Project | NaN |
| EMP-115 | PRJ-105 | 2026-07-31 | 2.5 | Project | NaN |
| EMP-115 | PRJ-102 | 2026-08-03 | 5.0 | Project | NaN |
| EMP-115 | PRJ-105 | 2026-08-03 | 2.5 | Project | NaN |
| EMP-115 | PRJ-102 | 2026-08-04 | 5.0 | Project | NaN |
| EMP-115 | PRJ-105 | 2026-08-04 | 2.5 | Project | NaN |
| EMP-115 | PRJ-102 | 2026-08-05 | 5.0 | Project | NaN |
| EMP-115 | PRJ-105 | 2026-08-05 | 2.5 | Project | NaN |
| EMP-115 | PRJ-102 | 2026-08-06 | 5.0 | Project | NaN |
| EMP-115 | PRJ-105 | 2026-08-06 | 2.5 | Project | NaN |
| EMP-115 | PRJ-102 | 2026-08-07 | 5.0 | Project | NaN |
| EMP-115 | PRJ-105 | 2026-08-07 | 2.5 | Project | NaN |
| EMP-116 | PRJ-104 | 2026-06-29 | 4.0 | Project | NaN |
| EMP-116 | PRJ-105 | 2026-06-29 | 3.5 | Project | NaN |
| EMP-116 | PRJ-104 | 2026-06-30 | 4.0 | Project | NaN |
| EMP-116 | PRJ-105 | 2026-06-30 | 3.5 | Project | NaN |
| EMP-116 | PRJ-104 | 2026-07-01 | 4.0 | Project | NaN |
| EMP-116 | PRJ-105 | 2026-07-01 | 4.0 | Project | NaN |
| EMP-116 | PRJ-104 | 2026-07-02 | 4.0 | Project | NaN |
| EMP-116 | PRJ-105 | 2026-07-02 | 4.0 | Project | NaN |
| EMP-116 | PRJ-104 | 2026-07-03 | 4.0 | Project | NaN |
| EMP-116 | PRJ-105 | 2026-07-03 | 4.0 | Project | NaN |
| EMP-116 | PRJ-104 | 2026-07-06 | 4.0 | Project | NaN |
| EMP-116 | PRJ-105 | 2026-07-06 | 3.5 | Project | NaN |
| EMP-116 | PRJ-104 | 2026-07-07 | 4.0 | Project | NaN |
| EMP-116 | PRJ-105 | 2026-07-07 | 3.5 | Project | NaN |
| EMP-116 | PRJ-104 | 2026-07-08 | 4.0 | Project | NaN |
| EMP-116 | PRJ-105 | 2026-07-08 | 4.0 | Project | NaN |
| EMP-116 | PRJ-104 | 2026-07-09 | 4.0 | Project | NaN |
| EMP-116 | PRJ-105 | 2026-07-09 | 4.0 | Project | NaN |
| EMP-116 | PRJ-104 | 2026-07-10 | 4.0 | Project | NaN |
| EMP-116 | PRJ-105 | 2026-07-10 | 4.0 | Project | NaN |
| EMP-116 | PRJ-104 | 2026-07-14 | 4.0 | Project | NaN |
| EMP-116 | PRJ-105 | 2026-07-14 | 3.5 | Project | NaN |
| EMP-116 | PRJ-104 | 2026-07-15 | 4.0 | Project | NaN |
| EMP-116 | PRJ-105 | 2026-07-15 | 3.5 | Project | NaN |
| EMP-116 | PRJ-104 | 2026-07-16 | 4.0 | Project | NaN |
| EMP-116 | PRJ-105 | 2026-07-16 | 4.0 | Project | NaN |
| EMP-116 | PRJ-104 | 2026-07-17 | 4.0 | Project | NaN |
| EMP-116 | PRJ-105 | 2026-07-17 | 4.0 | Project | NaN |
| EMP-116 | PRJ-104 | 2026-07-20 | 4.0 | Project | NaN |
| EMP-116 | PRJ-105 | 2026-07-20 | 3.5 | Project | NaN |
| EMP-116 | PRJ-104 | 2026-07-21 | 4.0 | Project | NaN |
| EMP-116 | PRJ-105 | 2026-07-21 | 3.5 | Project | NaN |
| EMP-116 | PRJ-104 | 2026-07-22 | 4.0 | Project | NaN |
| EMP-116 | PRJ-105 | 2026-07-22 | 4.0 | Project | NaN |
| EMP-116 | PRJ-104 | 2026-07-23 | 4.0 | Project | NaN |
| EMP-116 | PRJ-105 | 2026-07-23 | 4.0 | Project | NaN |
| EMP-116 | PRJ-104 | 2026-07-24 | 4.0 | Project | NaN |
| EMP-116 | PRJ-105 | 2026-07-24 | 4.0 | Project | NaN |
| EMP-116 | PRJ-104 | 2026-07-27 | 4.0 | Project | NaN |
| EMP-116 | PRJ-105 | 2026-07-27 | 3.5 | Project | NaN |
| EMP-116 | PRJ-104 | 2026-07-28 | 4.0 | Project | NaN |
| EMP-116 | PRJ-105 | 2026-07-28 | 3.5 | Project | NaN |
| EMP-116 | PRJ-104 | 2026-07-29 | 4.0 | Project | NaN |
| EMP-116 | PRJ-105 | 2026-07-29 | 4.0 | Project | NaN |
| EMP-116 | PRJ-104 | 2026-07-30 | 4.0 | Project | NaN |
| EMP-116 | PRJ-105 | 2026-07-30 | 4.0 | Project | NaN |
| EMP-116 | PRJ-104 | 2026-07-31 | 4.0 | Project | NaN |
| EMP-116 | PRJ-105 | 2026-07-31 | 4.0 | Project | NaN |
| EMP-116 | PRJ-104 | 2026-08-03 | 4.0 | Project | NaN |
| EMP-116 | PRJ-105 | 2026-08-03 | 3.5 | Project | NaN |
| EMP-116 | PRJ-104 | 2026-08-04 | 4.0 | Project | NaN |
| EMP-116 | PRJ-105 | 2026-08-04 | 3.5 | Project | NaN |
| EMP-116 | PRJ-104 | 2026-08-05 | 4.0 | Project | NaN |
| EMP-116 | PRJ-105 | 2026-08-05 | 4.0 | Project | NaN |
| EMP-116 | PRJ-104 | 2026-08-06 | 4.0 | Project | NaN |
| EMP-116 | PRJ-105 | 2026-08-06 | 4.0 | Project | NaN |
| EMP-116 | PRJ-104 | 2026-08-07 | 4.0 | Project | NaN |
| EMP-116 | PRJ-105 | 2026-08-07 | 4.0 | Project | NaN |
| EMP-117 | PRJ-102 | 2026-06-29 | 3.5 | Project | NaN |
| EMP-117 | PRJ-106 | 2026-06-29 | 4.5 | Project | NaN |
| EMP-117 | PRJ-102 | 2026-06-30 | 4.0 | Project | NaN |
| EMP-117 | PRJ-106 | 2026-06-30 | 4.5 | Project | NaN |
| EMP-117 | PRJ-102 | 2026-07-01 | 4.0 | Project | NaN |
| EMP-117 | PRJ-106 | 2026-07-01 | 4.5 | Project | NaN |
| EMP-117 | PRJ-102 | 2026-07-02 | 4.0 | Project | NaN |
| EMP-117 | PRJ-106 | 2026-07-02 | 4.5 | Project | NaN |
| EMP-117 | PRJ-102 | 2026-07-03 | 4.0 | Project | NaN |
| EMP-117 | PRJ-106 | 2026-07-03 | 4.5 | Project | NaN |
| EMP-117 | PRJ-102 | 2026-07-06 | 3.5 | Project | NaN |
| EMP-117 | PRJ-106 | 2026-07-06 | 4.5 | Project | NaN |
| EMP-117 | PRJ-102 | 2026-07-07 | 4.0 | Project | NaN |
| EMP-117 | PRJ-106 | 2026-07-07 | 4.5 | Project | NaN |
| EMP-117 | PRJ-102 | 2026-07-08 | 4.0 | Project | NaN |
| EMP-117 | PRJ-106 | 2026-07-08 | 4.5 | Project | NaN |
| EMP-117 | PRJ-102 | 2026-07-09 | 4.0 | Project | NaN |
| EMP-117 | PRJ-106 | 2026-07-09 | 4.5 | Project | NaN |
| EMP-117 | PRJ-102 | 2026-07-10 | 4.0 | Project | NaN |
| EMP-117 | PRJ-106 | 2026-07-10 | 4.5 | Project | NaN |
| EMP-117 | PRJ-102 | 2026-07-14 | 3.5 | Project | NaN |
| EMP-117 | PRJ-106 | 2026-07-14 | 4.5 | Project | NaN |
| EMP-117 | PRJ-102 | 2026-07-15 | 4.0 | Project | NaN |
| EMP-117 | PRJ-106 | 2026-07-15 | 4.5 | Project | NaN |
| EMP-117 | PRJ-102 | 2026-07-16 | 4.0 | Project | NaN |
| EMP-117 | PRJ-106 | 2026-07-16 | 4.5 | Project | NaN |
| EMP-117 | PRJ-102 | 2026-07-17 | 4.0 | Project | NaN |
| EMP-117 | PRJ-106 | 2026-07-17 | 4.5 | Project | NaN |
| EMP-117 | PRJ-102 | 2026-07-20 | 3.5 | Project | NaN |
| EMP-117 | PRJ-106 | 2026-07-20 | 4.5 | Project | NaN |
| EMP-117 | PRJ-102 | 2026-07-21 | 4.0 | Project | NaN |
| EMP-117 | PRJ-106 | 2026-07-21 | 4.5 | Project | NaN |
| EMP-117 | PRJ-102 | 2026-07-22 | 4.0 | Project | NaN |
| EMP-117 | PRJ-106 | 2026-07-22 | 4.5 | Project | NaN |
| EMP-117 | PRJ-102 | 2026-07-23 | 4.0 | Project | NaN |
| EMP-117 | PRJ-106 | 2026-07-23 | 4.5 | Project | NaN |
| EMP-117 | PRJ-102 | 2026-07-24 | 4.0 | Project | NaN |
| EMP-117 | PRJ-106 | 2026-07-24 | 4.5 | Project | NaN |
| EMP-117 | PRJ-102 | 2026-07-27 | 3.5 | Project | NaN |
| EMP-117 | PRJ-106 | 2026-07-27 | 4.5 | Project | NaN |
| EMP-117 | PRJ-102 | 2026-07-28 | 4.0 | Project | NaN |
| EMP-117 | PRJ-106 | 2026-07-28 | 4.5 | Project | NaN |
| EMP-117 | PRJ-102 | 2026-07-29 | 4.0 | Project | NaN |
| EMP-117 | PRJ-106 | 2026-07-29 | 4.5 | Project | NaN |
| EMP-117 | PRJ-102 | 2026-07-30 | 4.0 | Project | NaN |
| EMP-117 | PRJ-106 | 2026-07-30 | 4.5 | Project | NaN |
| EMP-117 | PRJ-102 | 2026-07-31 | 4.0 | Project | NaN |
| EMP-117 | PRJ-106 | 2026-07-31 | 4.5 | Project | NaN |
| EMP-117 | PRJ-102 | 2026-08-03 | 3.5 | Project | NaN |
| EMP-117 | PRJ-106 | 2026-08-03 | 4.5 | Project | NaN |
| EMP-117 | PRJ-102 | 2026-08-04 | 4.0 | Project | NaN |
| EMP-117 | PRJ-106 | 2026-08-04 | 4.5 | Project | NaN |
| EMP-117 | PRJ-102 | 2026-08-05 | 4.0 | Project | NaN |
| EMP-117 | PRJ-106 | 2026-08-05 | 4.5 | Project | NaN |
| EMP-117 | PRJ-102 | 2026-08-06 | 4.0 | Project | NaN |
| EMP-117 | PRJ-106 | 2026-08-06 | 4.5 | Project | NaN |
| EMP-117 | PRJ-102 | 2026-08-07 | 4.0 | Project | NaN |
| EMP-117 | PRJ-106 | 2026-08-07 | 4.5 | Project | NaN |
| EMP-118 | PRJ-101 | 2026-06-29 | 3.5 | Project | NaN |
| EMP-118 | PRJ-105 | 2026-06-29 | 5.0 | Project | NaN |
| EMP-118 | PRJ-101 | 2026-06-30 | 3.5 | Project | NaN |
| EMP-118 | PRJ-105 | 2026-06-30 | 5.0 | Project | NaN |
| EMP-118 | PRJ-101 | 2026-07-01 | 4.0 | Project | NaN |
| EMP-118 | PRJ-105 | 2026-07-01 | 5.0 | Project | NaN |
| EMP-118 | PRJ-101 | 2026-07-02 | 4.0 | Project | NaN |
| EMP-118 | PRJ-105 | 2026-07-02 | 5.0 | Project | NaN |
| EMP-118 | PRJ-101 | 2026-07-03 | 4.0 | Project | NaN |
| EMP-118 | PRJ-105 | 2026-07-03 | 5.0 | Project | NaN |
| EMP-118 | PRJ-101 | 2026-07-06 | 3.5 | Project | NaN |
| EMP-118 | PRJ-105 | 2026-07-06 | 5.0 | Project | NaN |
| EMP-118 | PRJ-101 | 2026-07-07 | 3.5 | Project | NaN |
| EMP-118 | PRJ-105 | 2026-07-07 | 5.0 | Project | NaN |
| EMP-118 | PRJ-101 | 2026-07-08 | 4.0 | Project | NaN |
| EMP-118 | PRJ-105 | 2026-07-08 | 5.0 | Project | NaN |
| EMP-118 | PRJ-101 | 2026-07-09 | 4.0 | Project | NaN |
| EMP-118 | PRJ-105 | 2026-07-09 | 5.0 | Project | NaN |
| EMP-118 | PRJ-101 | 2026-07-10 | 4.0 | Project | NaN |
| EMP-118 | PRJ-105 | 2026-07-10 | 5.0 | Project | NaN |
| EMP-118 | PRJ-101 | 2026-07-14 | 3.5 | Project | NaN |
| EMP-118 | PRJ-105 | 2026-07-14 | 5.0 | Project | NaN |
| EMP-118 | PRJ-101 | 2026-07-15 | 3.5 | Project | NaN |
| EMP-118 | PRJ-105 | 2026-07-15 | 5.0 | Project | NaN |
| EMP-118 | PRJ-101 | 2026-07-16 | 4.0 | Project | NaN |
| EMP-118 | PRJ-105 | 2026-07-16 | 5.0 | Project | NaN |
| EMP-118 | PRJ-101 | 2026-07-17 | 4.0 | Project | NaN |
| EMP-118 | PRJ-105 | 2026-07-17 | 5.0 | Project | NaN |
| EMP-118 | PRJ-101 | 2026-07-20 | 3.5 | Project | NaN |
| EMP-118 | PRJ-105 | 2026-07-20 | 5.0 | Project | NaN |
| EMP-118 | PRJ-101 | 2026-07-21 | 3.5 | Project | NaN |
| EMP-118 | PRJ-105 | 2026-07-21 | 5.0 | Project | NaN |
| EMP-118 | PRJ-101 | 2026-07-22 | 4.0 | Project | NaN |
| EMP-118 | PRJ-105 | 2026-07-22 | 5.0 | Project | NaN |
| EMP-118 | PRJ-101 | 2026-07-23 | 4.0 | Project | NaN |
| EMP-118 | PRJ-105 | 2026-07-23 | 5.0 | Project | NaN |
| EMP-118 | PRJ-101 | 2026-07-24 | 4.0 | Project | NaN |
| EMP-118 | PRJ-105 | 2026-07-24 | 5.0 | Project | NaN |
| EMP-118 | PRJ-101 | 2026-07-27 | 3.5 | Project | NaN |
| EMP-118 | PRJ-105 | 2026-07-27 | 5.0 | Project | NaN |
| EMP-118 | PRJ-101 | 2026-07-28 | 3.5 | Project | NaN |
| EMP-118 | PRJ-105 | 2026-07-28 | 5.0 | Project | NaN |
| EMP-118 | PRJ-101 | 2026-07-29 | 4.0 | Project | NaN |
| EMP-118 | PRJ-105 | 2026-07-29 | 5.0 | Project | NaN |
| EMP-118 | PRJ-101 | 2026-07-30 | 4.0 | Project | NaN |
| EMP-118 | PRJ-105 | 2026-07-30 | 5.0 | Project | NaN |
| EMP-118 | PRJ-101 | 2026-07-31 | 4.0 | Project | NaN |
| EMP-118 | PRJ-105 | 2026-07-31 | 5.0 | Project | NaN |
| EMP-118 | PRJ-101 | 2026-08-03 | 3.5 | Project | NaN |
| EMP-118 | PRJ-105 | 2026-08-03 | 5.0 | Project | NaN |
| EMP-118 | PRJ-101 | 2026-08-04 | 3.5 | Project | NaN |
| EMP-118 | PRJ-105 | 2026-08-04 | 5.0 | Project | NaN |
| EMP-118 | PRJ-101 | 2026-08-05 | 4.0 | Project | NaN |
| EMP-118 | PRJ-105 | 2026-08-05 | 5.0 | Project | NaN |
| EMP-118 | PRJ-101 | 2026-08-06 | 4.0 | Project | NaN |
| EMP-118 | PRJ-105 | 2026-08-06 | 5.0 | Project | NaN |
| EMP-118 | PRJ-101 | 2026-08-07 | 4.0 | Project | NaN |
| EMP-118 | PRJ-105 | 2026-08-07 | 5.0 | Project | NaN |

## DS03_Overbook_Idle_Config
| Config\_ID | Rule\_name | Overbook\_threshold | Overbook\_red\_threshold | Idle\_threshold | Mismatch\_pct\_threshold | OT\_max\_hours\_per\_week | Effective\_date |
| --- | --- | --- | --- | --- | --- | --- | --- |
| CFG-001 | SETA-08-SOP-001 RAG thresholds | 1.1 | 1.2 | 0.75 | 0.2 | 48 | 2026-01-01 |

## DS04_Leave_Holiday_Records
| Record\_ID | Member\_ID | Leave\_date | Leave\_type | Approved | Duration\_days | Note |
| --- | --- | --- | --- | --- | --- | --- |
| LV-0001 | NaN | 2026-07-13 | Public Holiday | True | 1 | Company-wide holiday |
| LV-0002 | EMP-003 | 2026-07-06 | Annual Leave | True | 1 | Approved annual leave (full week) |
| LV-0003 | EMP-003 | 2026-07-07 | Annual Leave | True | 1 | Approved annual leave (full week) |
| LV-0004 | EMP-003 | 2026-07-08 | Annual Leave | True | 1 | Approved annual leave (full week) |
| LV-0005 | EMP-003 | 2026-07-09 | Annual Leave | True | 1 | Approved annual leave (full week) |
| LV-0006 | EMP-003 | 2026-07-10 | Annual Leave | True | 1 | Approved annual leave (full week) |
| LV-0007 | EMP-003 | 2026-07-27 | Approved OT Comp | True | 1 | Approved OT — exclude from over-log flag |
| LV-0008 | EMP-003 | 2026-07-28 | Approved OT Comp | True | 1 | Approved OT — exclude from over-log flag |
| LV-0009 | EMP-009 | 2026-07-14 | Training | True | 1 | Onboarding training (also logged in timesheet) |
| LV-0010 | EMP-009 | 2026-07-15 | Training | True | 1 | Onboarding training (also logged in timesheet) |
| LV-0011 | EMP-009 | 2026-07-16 | Training | True | 1 | Onboarding training (also logged in timesheet) |

## DS05_Project_Master
| Shared master — identical rows appear in PMO\_01 file. | Unnamed: 1 | Unnamed: 2 | Unnamed: 3 | Unnamed: 4 | Unnamed: 5 | Unnamed: 6 | Unnamed: 7 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Project\_ID | Project\_name | Account\_ID | Project\_type | Status | PM\_ID | Start\_date | End\_date |
| PRJ-001 | Project Orion (Core Banking) | ACC-A | Software/Migration | Active | EMP-012 | 2026-05-19 | 2026-12-19 |
| PRJ-002 | Energent AI (Data Platform) | ACC-B | AI/ML Platform | Active | EMP-012 | 2026-04-06 | 2026-12-31 |
| PRJ-003 | Project Titan (Internal Tools) | ACC-A | Software | Active | EMP-011 | 2026-06-01 | 2026-10-31 |
| PRJ-H-101 | Mercury Core Migration | ACC-A | Software/Migration | Completed | EMP-012 | 2025-01-06 | 2025-09-05 |
| PRJ-H-102 | Saturn Banking Upgrade | ACC-A | Software/Migration | Completed | EMP-012 | 2025-02-03 | 2025-09-01 |
| PRJ-H-103 | Comet ML Pipeline | ACC-B | AI/ML Platform | Completed | EMP-011 | 2024-10-07 | 2025-07-07 |
| PRJ-H-104 | Nebula Forecast Engine | ACC-B | AI/ML Platform | Completed | EMP-011 | 2024-11-04 | 2025-07-21 |
| PRJ-H-105 | Pulsar CRM | ACC-C | Software | Completed | EMP-012 | 2025-03-03 | 2025-07-01 |
| PRJ-H-199 | Flux POC | ACC-C | AI/ML Platform | Completed | EMP-011 | 2025-05-01 | 2025-05-16 |
| PRJ-101 | Project Apollo | ACC-E | Software/Migration | Active | EMP-012 | 2026-04-05 | 2026-09-12 |
| PRJ-102 | Project Vega | ACC-C | Software | Active | EMP-101 | 2026-04-11 | 2026-11-11 |
| PRJ-103 | Project Lyra | ACC-C | Software/Migration | Active | EMP-012 | 2026-03-08 | 2026-10-16 |
| PRJ-104 | Project Draco | ACC-B | Integration | Active | EMP-101 | 2026-04-27 | 2026-12-06 |
| PRJ-105 | Project Orbit | ACC-D | Integration | Active | EMP-101 | 2026-06-21 | 2026-11-05 |
| PRJ-106 | Project Helios | ACC-A | Software/Migration | Active | EMP-102 | 2026-03-28 | 2026-10-26 |
| PRJ-107 | Project Atlas | ACC-A | Mobile | Active | EMP-012 | 2026-03-23 | 2026-10-09 |
| PRJ-108 | Project Zephyr | ACC-A | Data | Active | EMP-102 | 2026-06-07 | 2026-11-08 |
| PRJ-H-201 | Project Zephyr (archived) | ACC-E | Software/Migration | Completed | EMP-012 | 2024-04-28 | 2025-02-15 |
| PRJ-H-202 | Project Cobalt (archived) | ACC-C | Software/Migration | Completed | EMP-011 | 2024-04-27 | 2025-01-15 |
| PRJ-H-203 | Project Quartz (archived) | ACC-C | Software | Completed | EMP-102 | 2024-08-24 | 2025-09-16 |
| PRJ-H-204 | Project Nimbus (archived) | ACC-B | Data | Completed | EMP-011 | 2024-03-12 | 2025-03-02 |
| PRJ-H-205 | Project Cedar (archived) | ACC-D | Software | Completed | EMP-012 | 2024-04-04 | 2025-07-04 |
| PRJ-H-206 | Project Falcon (archived) | ACC-A | Integration | Completed | EMP-101 | 2024-07-05 | 2025-08-07 |

## DS06_Member_Master
| Shared master — identical rows appear in PMO\_01 file. | Unnamed: 1 | Unnamed: 2 | Unnamed: 3 | Unnamed: 4 | Unnamed: 5 | Unnamed: 6 | Unnamed: 7 | Unnamed: 8 | Unnamed: 9 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Member\_ID | Full\_name | Department | Role\_title | Level | Line\_manager\_id | Employment\_status | Employment | Std\_hours\_week | Join\_date |
| EMP-001 | Nguyen Van An | Backend | Backend Developer | L3 | EMP-004 | Active | FT | 40 | 2023-03-01 |
| EMP-002 | Tran Thi Bich | Data | Data Engineer | L3 | EMP-011 | Active | FT | 40 | 2022-09-12 |
| EMP-003 | Le Van Cuong | AI/ML | ML Engineer | L4 | EMP-011 | Active | FT | 40 | 2021-06-01 |
| EMP-004 | Pham Thi Dung | Backend | Backend Lead | L5 | EMP-011 | Active | FT | 40 | 2019-02-18 |
| EMP-005 | Hoang Van Em | Platform | DevOps Engineer | L4 | EMP-011 | Active | FT | 40 | 2022-01-10 |
| EMP-006 | Do Van Khoa | Security | Security Engineer | L4 | EMP-011 | Active | FT | 40 | 2020-11-03 |
| EMP-007 | Bui Thi Hoa | Design | UX/UI Designer | L3 | EMP-012 | Active | PT | 20 | 2023-08-21 |
| EMP-008 | Ngo Thi Lan | BA | Business Analyst | L3 | EMP-012 | Active | FT | 40 | 2022-04-04 |
| EMP-009 | Ly Van Minh | Frontend | Frontend Developer | L2 | EMP-004 | Probation | FT | 40 | 2026-07-14 |
| EMP-010 | Truong Thi Nga | QA | QA Engineer | L3 | EMP-004 | Active | FT | 40 | 2021-10-07 |
| EMP-011 | Vu Thi Mai | Engineering | Engineering Manager | L6 | EMP-012 | Active | FT | 40 | 2017-05-02 |
| EMP-012 | Dang Van Phuc | PMO | PMO Lead / PM | L6 | NaN | Active | FT | 40 | 2016-01-15 |
| EMP-101 | Le Anh Tuan | PMO | Project Manager | L5 | EMP-101 | Active | FT | 40 | 2019-09-28 |
| EMP-102 | Dao Chi Nam | PMO | Project Manager | L5 | EMP-011 | Active | FT | 40 | 2019-07-23 |
| EMP-103 | Hoang Hieu Nam | Backend | Backend Developer | L3 | EMP-011 | Active | FT | 40 | 2020-11-01 |
| EMP-104 | Do My Quan | BA | Business Analyst | L4 | EMP-101 | Active | FT | 40 | 2024-08-06 |
| EMP-105 | Do Trang Binh | Platform | DevOps Engineer | L2 | EMP-101 | Active | FT | 40 | 2020-03-11 |
| EMP-106 | Do Yen Quynh | Frontend | Frontend Developer | L5 | EMP-101 | Active | FT | 40 | 2024-12-06 |
| EMP-107 | Ho Hung Thao | Data | Data Engineer | L3 | EMP-101 | Active | FT | 40 | 2023-07-06 |
| EMP-108 | Phan Nhung My | Frontend | Frontend Developer | L3 | EMP-011 | Active | FT | 40 | 2020-10-28 |
| EMP-109 | Phan Ha Ha | Platform | DevOps Engineer | L5 | EMP-011 | Active | FT | 40 | 2023-01-21 |
| EMP-110 | Pham Trang Anh | Frontend | Frontend Developer | L4 | EMP-011 | Active | FT | 40 | 2021-05-11 |
| EMP-111 | Do Anh Hieu | BA | Business Analyst | L4 | EMP-102 | Active | FT | 40 | 2020-02-03 |
| EMP-112 | Ngo Tuan Hieu | BA | Business Analyst | L3 | EMP-012 | Active | FT | 40 | 2024-01-11 |
| EMP-113 | Pham Ha Viet | Backend | Backend Developer | L2 | EMP-101 | Active | PT | 20 | 2018-11-15 |
| EMP-114 | Tran Long Giang | Design | UX/UI Designer | L5 | EMP-012 | Active | PT | 20 | 2023-02-04 |
| EMP-115 | Cao Nam Long | Design | UX/UI Designer | L5 | EMP-011 | Active | FT | 40 | 2020-02-19 |
| EMP-116 | Cao Ngan Thao | QA | QA Engineer | L4 | EMP-012 | Active | FT | 40 | 2024-06-01 |
| EMP-117 | Duong Dat Chi | AI/ML | ML Engineer | L4 | EMP-101 | Active | FT | 40 | 2021-01-08 |
| EMP-118 | Duong Nhung Binh | Design | UX/UI Designer | L3 | EMP-101 | Active | FT | 40 | 2024-01-19 |

## REF_Calendar_Weeks
| Week\_ID | Week\_start | Week\_end | Working\_days | Holiday\_hours\_ft | Note |
| --- | --- | --- | --- | --- | --- |
| W1 | 2026-06-29 | 2026-07-03 | 5 | 0 | NaN |
| W2 | 2026-07-06 | 2026-07-10 | 5 | 0 | NaN |
| W3 | 2026-07-13 | 2026-07-17 | 4 | 8 | Company public holiday Mon 2026-07-13 → 4 working days |
| W4 | 2026-07-20 | 2026-07-24 | 5 | 0 | NaN |
| W5 | 2026-07-27 | 2026-07-31 | 5 | 0 | NaN |
| W6 | 2026-08-03 | 2026-08-07 | 5 | 0 | NaN |

## REF_KPI_Norms
| Norm\_ID | Metric | Formula | Green | Yellow | Red | Used\_for |
| --- | --- | --- | --- | --- | --- | --- |
| N01 | Busy Rate | Planned\_h / Available\_h | 85-110% | 111-119% | >120% or <75% | Overbook/Idle — Problem 2 + feasibility Problem 1 |
| N02 | Utilization Rate | Worked\_h / Available\_h | 75-90% | 60-74% / 91-100% | <60% or >100% | Real intensity; >100% burnout — Problem 2 |
| N03 | Billable Rate | Billable\_h / Worked\_h | >=80% | 70-79% | <70% | Revenue-generating hours — Problem 2 |
| N04 | Bench Rate | Bench\_h / Available\_h | <=10% | 11-20% | >20% | Unassigned capacity — Problem 2 (idle) |
| N05 | Overtime Ratio | OT\_h / Standard\_h | <=5% | 6-15% | >15% | Leading burnout — Problem 2 (OT edge) |
| N06 | Effort Consumption | Actual\_h / Planned\_h | 85-110% | 75-84% / 111-119% | <=75% or >=120% | RA vs Timesheet mismatch — Problem 2 + Problem 1 |
| N07 | On-time Delivery | On-time\_MS / Total\_MS | >=90% | 70-89% | <70% | Benchmark feasibility — Problem 1 |
| N08 | SPI | EV / PV | 0.95-1.05 | 0.85-0.94 / 1.06-1.15 | <0.85 or >1.15 | Schedule realism — Problem 1 |
| N09 | Velocity Variance | StdDev(5 sprint)/Avg | <=15% | 16-25% | >25% | Forecast reliability — Problem 1 |
| N10 | THI | Non-dev\_h / Total\_h | 15-25% | 10-14% / 26-35% | <10% or >35% | Tech-debt prevention budget — Problem 1 |
| N11 | Risk Closure Rate | Risks\_closed / Total | >=80% | 60-79% | <60% | Whether RAID is alive — Problem 1 |
| N12 | Training Compliance | Done / Required | 100% | 85-99% | <85% | Valid edge case (training) — Problem 2 |

## Answer_Key
| Grading key — remove before distributing to the team if running a blind contest. | Unnamed: 1 | Unnamed: 2 | Unnamed: 3 | Unnamed: 4 | Unnamed: 5 | Unnamed: 6 |
| --- | --- | --- | --- | --- | --- | --- |
| Finding\_ID | Problem | Entity\_type | Entity\_id | Issue\_type | Expected\_detection | Severity |
| F-07 | Problem 2 | Member | EMP-004 | Overbook | Busy 125% (Red, Orion 80 + Energent 45) -> rebalance urgently | High |
| F-08 | Problem 2 | Member | EMP-001 | Overbook | Busy 115% (Yellow, Orion 60 + Titan 55) | Medium |
| F-09 | Problem 2 | Member | EMP-005 | Idle | Busy 60% (Red), no approved leave -> genuinely idle | Medium |
| F-10 | Problem 2 | Member | EMP-008 | Idle | Busy 50% (Red), under-allocated | Medium |
| F-11 | Problem 2 | Member | EMP-002 | Mismatch\_underlog | Effort Consumption ~53% (Red); no leave/OT | Medium |
| F-12 | Problem 2 | Member | EMP-006 | Mismatch\_overlog | EC ~124% (Red); OT not approved -> burnout watch | High |
| F-13 | Problem 2 | Member | EMP-003 | Edge\_exclude | Leave W2 + Approved OT W5 -> do NOT flag | Info |
| F-14 | Problem 2 | Week | W3 | Edge\_holiday | Holiday week reduces Available -> low logs are normal, do NOT flag | Info |
| F-15 | Problem 2 | Member | EMP-009 | Edge\_onboard\_missing | W1-2 pre-onboarding (RA/log empty) -> validate as missing, do NOT flag idle | Info |
| F-16 | Problem 2 | Member | EMP-010 | Data\_duplicate | RA row PRJ-002 is DUPLICATED -> dedup to avoid double-count (naive sum -> false 160%) | High |
| F-17 | Problem 2 | Member | EMP-007 | Guardrail\_parttime | Normalize to Available 20h -> Busy 80% (OK), do not use 40h | Info |