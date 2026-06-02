## LEGEND & SUMMARY
| PMO 01 - Project Plan Review & Feasibility Validation Agent | Mock Dataset | Unnamed: 1 | Unnamed: 2 | Unnamed: 3 | Unnamed: 4 | Unnamed: 5 |
| --- | --- | --- | --- | --- | --- |
| Input for an agent that checks a Project Plan for completeness vs the PMO template, detects timeline/resource/dependency feasibility risks, and benchmarks against similar historical projects. Shared masters (members, projects) are identical to the PMO 02 file. NOTE: DS03 is a representative snapshot; a plan's Team\_size is the full planned headcount, so not every team member appears in the current allocation window. | NaN | NaN | NaN | NaN | NaN |
| NaN | NaN | NaN | NaN | NaN | NaN |
| Sheet | Grain (1 row =) | Field | Type | Example | Description |
| DS01\_Project\_Plan | 1 task / milestone in a plan under review | Project\_ID | String | PRJ-002 | Project the plan belongs to (FK -> Project\_Master). |
| NaN | NaN | Project\_name | String | Energent AI | Project name. |
| NaN | NaN | Task\_ID | String | TASK-E04 | Unique task id within the plan. |
| NaN | NaN | Task\_name | String | Model training service | Task description. |
| NaN | NaN | Assignee\_id | String | EMP-003 | Member assigned (FK -> Member\_Master). |
| NaN | NaN | Start\_date | Date | 2026-06-01 | Task start (YYYY-MM-DD). |
| NaN | NaN | End\_date | Date | 2026-08-21 | Task end; must be >= start. |
| NaN | NaN | Effort\_days | Float | 110.0 | Estimated effort (man-days); sums to plan effort. |
| NaN | NaN | Percent\_complete | Float | 0.40 | Completion 0.0-1.0 at snapshot. |
| NaN | NaN | Status | Enum | In Progress | Not Started/In Progress/Completed/Blocked/Delayed. |
| NaN | NaN | Milestone\_flag | Bool | TRUE | TRUE if task is a milestone. |
| NaN | NaN | Dependencies | String | TASK-E08 | CSV of prerequisite task ids (may form a cycle!). |
| NaN | NaN | Phase | String | Development | Discovery/Design/Development/Testing/Deployment. |
| NaN | NaN | Risk\_note | String | Key person risk | Task-level risk note. |
| DS02\_PMO\_Standard\_Template | 1 required component of the PMO template | Template\_ID | String | TPL-2026-v3 | Template version id. |
| NaN | NaN | Template\_name | String | Standard Project Plan Template | Template name. |
| NaN | NaN | Version | String | 3.0 | Version. |
| NaN | NaN | Effective\_date | Date | 2026-01-01 | Effective date. |
| NaN | NaN | Component\_ID | String | COMP-007 | Component id. |
| NaN | NaN | Section\_code | String | S07 | Section code S01-S08. |
| NaN | NaN | Component\_name | String | Risk\_RAID | Required component name. |
| NaN | NaN | Required | Bool | TRUE | TRUE = mandatory in every plan. |
| NaN | NaN | Validation\_rule | String | >=1 risk entry | Validity rule. |
| NaN | NaN | Weight | Float | 0.16 | Scoring weight (all components sum to 1.0). |
| DS03\_Resource\_Allocation | 1 member x project allocation (current snapshot) | Member\_ID | String | EMP-004 | Member (FK -> Member\_Master). |
| NaN | NaN | Project\_ID | String | PRJ-001 | Project (FK -> Project\_Master). |
| NaN | NaN | Role | Enum | BE | Role code on this allocation. |
| NaN | NaN | Allocation\_pct | Float | 0.80 | Share of the member's standard week. |
| NaN | NaN | Start\_date | Date | 2026-06-29 | Allocation start. |
| NaN | NaN | End\_date | Date | 2026-08-07 | Allocation end. |
| NaN | NaN | Busy\_rate | Float | 1.25 | Sum of the member's allocation across projects. |
| DS04\_Velocity\_History | 1 sprint of a completed project | Project\_ID | String | PRJ-H-103 | Historical project (FK). |
| NaN | NaN | Project\_type | String | AI/ML Platform | Project type. |
| NaN | NaN | Sprint\_no | Int | 3 | Sprint number. |
| NaN | NaN | Sprint\_duration\_days | Int | 14 | Sprint length. |
| NaN | NaN | Planned\_points | Float | 40.0 | Planned story points. |
| NaN | NaN | Completed\_points | Float | 37.2 | Completed story points. |
| NaN | NaN | Velocity\_ratio | Float | 0.93 | Completed / planned. |
| NaN | NaN | Team\_size | Int | 9 | Team size that sprint. |
| NaN | NaN | Outcome | Enum | Completed | Sprint outcome. |
| DS05\_Historical\_Projects | 1 completed project (benchmark) | Historical\_project\_id | String | PRJ-H-101 | Historical project id. |
| NaN | NaN | Project\_type | String | Software/Migration | Type (filter for similar benchmark). |
| NaN | NaN | Team\_size | Int | 8 | Team size. |
| NaN | NaN | Duration\_days | Int | 240 | Actual duration. |
| NaN | NaN | Planned\_duration\_days | Int | 225 | Planned duration. |
| NaN | NaN | Total\_effort\_days | Float | 180.0 | Actual effort (man-days). |
| NaN | NaN | Total\_budget\_scaled | Float | 8.6 | Scaled budget (1.0 = baseline). |
| NaN | NaN | Avg\_velocity\_ratio | Float | 0.92 | Avg velocity ratio. |
| NaN | NaN | Risk\_count | Int | 5 | Risks raised. |
| NaN | NaN | Key\_risks | String | Cutover risk | Generalized key risks. |
| NaN | NaN | PMO\_standard\_ver | String | 2.1 | PMO template version used. |
| NaN | NaN | Final\_outcome | Enum | On Time | On Time/Delayed/Cancelled/Early. |
| NaN | NaN | Is\_outlier | Bool | FALSE | TRUE = exclude from benchmarking (e.g. tiny POC). |
| DS06\_Plan\_Section\_Check  [ADDED] | 1 template component checked against a plan | Check\_ID | String | CHK-015 | Check id. |
| NaN | NaN | Plan\_ID | String | PLAN-002 | Plan reviewed. |
| NaN | NaN | Component\_ID | String | COMP-007 | Template component (NULL if custom). |
| NaN | NaN | Custom\_name | String | EVM\_Cost\_Tracking | Name when status = Custom. |
| NaN | NaN | Status | Enum | Missing | Complete/Weak/Missing/Custom. |
| NaN | NaN | Note | String | Risk Register absent | Why weak/missing/custom. |
| DS07\_Project\_Plan\_Summary  [ADDED] | 1 plan under review (header metrics) | Plan\_ID | String | PLAN-002 | Plan id. |
| NaN | NaN | Project\_ID | String | PRJ-002 | Project. |
| NaN | NaN | Project\_name | String | Energent AI | Project name. |
| NaN | NaN | Plan\_set | String | To\_Review | Review queue. |
| NaN | NaN | Effort\_MD | Float | 426 | Total effort (man-days). |
| NaN | NaN | Duration\_months | Float | 9 | Planned duration. |
| NaN | NaN | Velocity\_MD\_month | Float | 47.3 | Effort / duration. |
| NaN | NaN | Team\_size | Int | 10 | Planned peak team. |
| NaN | NaN | Risk\_count | Int | 0 | Risks registered (0 = missing register). |
| NaN | NaN | Top\_risk\_score | Float | NaN | Highest risk score. |
| NaN | NaN | THI\_pct | Float | 9 | Tech-health index %. |
| NaN | NaN | Peak\_role\_busy\_rate\_pct | Float | 135 | Peak role demand vs capacity. |
| NaN | NaN | On\_time\_history\_pct | Float | 90 | PM on-time history. |
| NaN | NaN | Feasibility\_status | String | Not feasible (Red) | Reviewer verdict. |
| DS08\_Role\_Capacity  [ADDED] | 1 role's current capacity | Capacity\_ID | String | CAP-08 | Capacity id. |
| NaN | NaN | Role | String | Security Engineer | Role. |
| NaN | NaN | Headcount | Int | 2 | People in role. |
| NaN | NaN | Capacity\_MD\_month | Float | 44 | Capacity man-days/month. |
| NaN | NaN | Busy\_rate\_pct | Float | 95 | Current busy %. |
| NaN | NaN | Available\_MD\_month | Float | 2 | Spare man-days/month. |
| NaN | NaN | Note | String | Bottleneck | Capacity note. |
| REF\_Member\_Master  [SHARED/REF] | 1 member (shared with Problem 2) | Member\_ID | String | EMP-003 | Member id. |
| NaN | NaN | Full\_name | String | Le Van Cuong | Name. |
| NaN | NaN | Role\_title | String | ML Engineer | Title. |
| NaN | NaN | Department | String | AI/ML | Department. |
| NaN | NaN | Employment | Enum | FT | FT/PT. |
| NaN | NaN | Std\_hours\_week | Float | 40 | Standard hours/week. |
| REF\_Project\_Master  [SHARED/REF] | 1 project (shared with Problem 2) | Project\_ID | String | PRJ-002 | Project id. |
| NaN | NaN | Project\_name | String | Energent AI | Name. |
| NaN | NaN | Project\_type | String | AI/ML Platform | Type. |
| NaN | NaN | Status | Enum | Active | Lifecycle status. |
| NaN | NaN | Is\_historical | Bool | FALSE | TRUE for completed/benchmark. |
| REF\_KPI\_Norms  [SHARED/REF] | 1 RAG metric threshold (SETA-08-SOP-001) | Norm\_ID | String | N07 | Norm id. |
| NaN | NaN | Metric | String | On-time Delivery | Metric. |
| NaN | NaN | Green/Yellow/Red | String | >=90% / ... | RAG thresholds. |
| Answer\_Key  [ANSWER KEY] | 1 finding the agent should detect (Problem 1) | Finding\_ID | String | F-01 | Finding id. |
| NaN | NaN | Entity\_id | String | PLAN-002 | Member/plan/benchmark. |
| NaN | NaN | Issue\_type | String | Missing\_section | Category. |
| NaN | NaN | Expected\_detection | String | Risk Register missing | What to detect. |
| NaN | NaN | Severity | String | High | Severity. |

## DS01_Project_Plan
| Project\_ID | Project\_name | Task\_ID | Task\_name | Assignee\_id | Start\_date | End\_date | Effort\_days | Percent\_complete | Status | Milestone\_flag | Dependencies | Phase | Risk\_note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| PRJ-001 | Project Orion (Core Banking) | TASK-O01 | Requirements & scope workshop | EMP-008 | 2026-05-19 | 2026-05-29 | 8.0 | 1.00 | Completed | False | NaN | Discovery | NaN |
| PRJ-001 | Project Orion (Core Banking) | TASK-O02 | As-is core banking assessment | EMP-004 | 2026-05-19 | 2026-06-05 | 12.0 | 1.00 | Completed | True | TASK-O01 | Discovery | Legacy COBOL knowledge scarce |
| PRJ-001 | Project Orion (Core Banking) | TASK-O03 | Target architecture design | EMP-004 | 2026-06-08 | 2026-06-26 | 15.0 | 0.80 | In Progress | False | TASK-O02 | Design | NaN |
| PRJ-001 | Project Orion (Core Banking) | TASK-O04 | Security & PCI design | EMP-006 | 2026-06-15 | 2026-07-03 | 12.0 | 0.60 | In Progress | False | TASK-O02 | Design | PCI audit dependency |
| PRJ-001 | Project Orion (Core Banking) | TASK-O05 | Account service migration | EMP-001 | 2026-07-06 | 2026-08-28 | 30.0 | 0.20 | In Progress | False | TASK-O03 | Development | NaN |
| PRJ-001 | Project Orion (Core Banking) | TASK-O06 | Transaction engine build | EMP-001 | 2026-07-20 | 2026-09-18 | 35.0 | 0.10 | Not Started | True | TASK-O03,TASK-O04 | Development | NaN |
| PRJ-001 | Project Orion (Core Banking) | TASK-O07 | CI/CD & infra automation | EMP-005 | 2026-07-06 | 2026-08-14 | 18.0 | 0.30 | In Progress | False | TASK-O03 | Development | NaN |
| PRJ-001 | Project Orion (Core Banking) | TASK-O08 | SIT — system integration test | EMP-010 | 2026-09-21 | 2026-10-16 | 20.0 | 0.00 | Not Started | False | TASK-O05,TASK-O06 | Testing | NaN |
| PRJ-001 | Project Orion (Core Banking) | TASK-O09 | Security penetration test | EMP-006 | 2026-10-05 | 2026-10-23 | 10.0 | 0.00 | Not Started | False | TASK-O06,TASK-O04 | Testing | NaN |
| PRJ-001 | Project Orion (Core Banking) | TASK-O10 | Cutover & go-live | EMP-005 | 2026-11-02 | 2026-11-20 | 8.0 | 0.00 | Not Started | True | TASK-O08,TASK-O09 | Deployment | Rollback window tight |
| PRJ-002 | Energent AI (Data Platform) | TASK-E01 | Data sources & scope mapping | EMP-008 | 2026-04-06 | 2026-04-17 | 12.0 | 1.00 | Completed | False | NaN | Discovery | NaN |
| PRJ-002 | Energent AI (Data Platform) | TASK-E02 | Feature store & pipeline design | EMP-002 | 2026-04-20 | 2026-05-15 | 30.0 | 0.90 | In Progress | True | TASK-E01 | Design | NaN |
| PRJ-002 | Energent AI (Data Platform) | TASK-E03 | Ingestion pipeline build | EMP-002 | 2026-05-18 | 2026-07-10 | 70.0 | 0.50 | In Progress | False | TASK-E02 | Development | NaN |
| PRJ-002 | Energent AI (Data Platform) | TASK-E04 | Model training service | EMP-003 | 2026-06-01 | 2026-08-21 | 110.0 | 0.40 | In Progress | True | TASK-E02 | Development | Single ML engineer — key person risk |
| PRJ-002 | Energent AI (Data Platform) | TASK-E05 | Frontend dashboard | EMP-009 | 2026-07-13 | 2026-09-04 | 55.0 | 0.00 | Not Started | False | TASK-E03 | Development | NaN |
| PRJ-002 | Energent AI (Data Platform) | TASK-E06 | Model validation testing | EMP-010 | 2026-06-15 | 2026-08-30 | 35.0 | 0.00 | Not Started | False | TASK-E04 | Testing | Starts before model service completes — order risk |
| PRJ-002 | Energent AI (Data Platform) | TASK-E07 | Integration & release | EMP-005 | 2026-09-07 | 2026-09-25 | 28.0 | 0.00 | Not Started | True | TASK-E08 | Deployment | Cyclic dependency with E08 |
| PRJ-002 | Energent AI (Data Platform) | TASK-E08 | End-to-end acceptance test | EMP-010 | 2026-09-28 | 2026-10-16 | 30.0 | 0.00 | Not Started | False | TASK-E07 | Testing | Cyclic dependency with E07 |
| PRJ-002 | Energent AI (Data Platform) | TASK-E09 | MLOps monitoring setup | EMP-005 | 2026-08-03 | 2026-08-28 | 30.0 | 0.00 | Not Started | False | TASK-E04 | Development | NaN |
| PRJ-002 | Energent AI (Data Platform) | TASK-E10 | Production rollout | EMP-005 | 2026-10-19 | 2026-11-06 | 26.0 | 0.00 | Not Started | True | TASK-E07,TASK-E08 | Deployment | NaN |
| PRJ-101 | Project Apollo | TASK-101-01 | Discovery work package 1 | EMP-106 | 2026-04-05 | 2026-09-12 | 26.2 | 0.54 | Completed | False | NaN | Discovery | NaN |
| PRJ-101 | Project Apollo | TASK-101-02 | Design work package 2 | EMP-105 | 2026-04-05 | 2026-09-12 | 26.3 | 0.00 | In Progress | True | TASK-101-01 | Design | NaN |
| PRJ-101 | Project Apollo | TASK-101-03 | Development work package 3 | EMP-107 | 2026-04-05 | 2026-09-12 | 26.2 | 0.29 | In Progress | False | TASK-101-02 | Development | NaN |
| PRJ-101 | Project Apollo | TASK-101-04 | Development work package 4 | EMP-103 | 2026-04-05 | 2026-09-12 | 26.3 | 0.35 | In Progress | False | TASK-101-03 | Development | NaN |
| PRJ-101 | Project Apollo | TASK-101-05 | Testing work package 5 | EMP-117 | 2026-04-05 | 2026-09-12 | 26.2 | 0.15 | In Progress | False | TASK-101-04 | Testing | NaN |
| PRJ-101 | Project Apollo | TASK-101-06 | Deployment work package 6 | EMP-111 | 2026-04-05 | 2026-09-12 | 26.3 | 0.07 | Completed | True | TASK-101-05 | Deployment | NaN |
| PRJ-102 | Project Vega | TASK-102-01 | Discovery work package 1 | EMP-107 | 2026-04-11 | 2026-11-11 | 30.0 | 0.35 | In Progress | False | NaN | Discovery | NaN |
| PRJ-102 | Project Vega | TASK-102-02 | Design work package 2 | EMP-103 | 2026-04-11 | 2026-11-11 | 30.0 | 0.07 | Not Started | True | TASK-102-01 | Design | NaN |
| PRJ-102 | Project Vega | TASK-102-03 | Development work package 3 | EMP-111 | 2026-04-11 | 2026-11-11 | 30.0 | 0.40 | Completed | False | TASK-102-02 | Development | NaN |
| PRJ-102 | Project Vega | TASK-102-04 | Development work package 4 | EMP-117 | 2026-04-11 | 2026-11-11 | 30.0 | 0.41 | In Progress | False | TASK-102-03 | Development | NaN |
| PRJ-102 | Project Vega | TASK-102-05 | Testing work package 5 | EMP-105 | 2026-04-11 | 2026-11-11 | 30.0 | 0.31 | Not Started | False | TASK-102-04 | Testing | NaN |
| PRJ-102 | Project Vega | TASK-102-06 | Deployment work package 6 | EMP-116 | 2026-04-11 | 2026-11-11 | 30.0 | 0.53 | Completed | True | TASK-102-05 | Deployment | NaN |
| PRJ-103 | Project Lyra | TASK-103-01 | Discovery work package 1 | EMP-105 | 2026-03-08 | 2026-10-16 | 30.0 | 0.41 | Not Started | False | NaN | Discovery | NaN |
| PRJ-103 | Project Lyra | TASK-103-02 | Design work package 2 | EMP-118 | 2026-03-08 | 2026-10-16 | 30.0 | 0.27 | Not Started | True | TASK-103-01 | Design | NaN |
| PRJ-103 | Project Lyra | TASK-103-03 | Development work package 3 | EMP-109 | 2026-03-08 | 2026-10-16 | 30.0 | 0.19 | In Progress | False | TASK-103-02 | Development | NaN |
| PRJ-103 | Project Lyra | TASK-103-04 | Development work package 4 | EMP-108 | 2026-03-08 | 2026-10-16 | 30.0 | 0.42 | In Progress | False | TASK-103-03 | Development | NaN |
| PRJ-103 | Project Lyra | TASK-103-05 | Testing work package 5 | EMP-113 | 2026-03-08 | 2026-10-16 | 30.0 | 0.30 | Not Started | False | TASK-103-04 | Testing | NaN |
| PRJ-103 | Project Lyra | TASK-103-06 | Deployment work package 6 | EMP-107 | 2026-03-08 | 2026-10-16 | 30.0 | 0.35 | Completed | True | TASK-103-05 | Deployment | NaN |
| PRJ-104 | Project Draco | TASK-104-01 | Discovery work package 1 | EMP-107 | 2026-04-27 | 2026-12-06 | 23.3 | 0.36 | Completed | False | NaN | Discovery | NaN |
| PRJ-104 | Project Draco | TASK-104-02 | Design work package 2 | EMP-105 | 2026-04-27 | 2026-12-06 | 23.3 | 0.02 | In Progress | True | TASK-104-01 | Design | NaN |
| PRJ-104 | Project Draco | TASK-104-03 | Development work package 3 | EMP-117 | 2026-04-27 | 2026-12-06 | 23.4 | 0.29 | In Progress | False | TASK-104-02 | Development | NaN |
| PRJ-104 | Project Draco | TASK-104-04 | Development work package 4 | EMP-111 | 2026-04-27 | 2026-12-06 | 23.3 | 0.31 | In Progress | False | TASK-104-03 | Development | NaN |
| PRJ-104 | Project Draco | TASK-104-05 | Testing work package 5 | EMP-116 | 2026-04-27 | 2026-12-06 | 23.4 | 0.52 | Completed | False | TASK-104-04 | Testing | NaN |
| PRJ-104 | Project Draco | TASK-104-06 | Deployment work package 6 | EMP-104 | 2026-04-27 | 2026-12-06 | 23.3 | 0.43 | Completed | True | TASK-104-05 | Deployment | NaN |

## DS02_PMO_Standard_Template
| Template\_ID | Template\_name | Version | Effective\_date | Component\_ID | Section\_code | Component\_name | Required | Validation\_rule | Weight |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TPL-2026-v3 | Standard Project Plan Template | 3.0 | 2026-01-01 | COMP-001 | S01 | Scope | True | Scope statement + in/out-of-scope list | 0.12 |
| TPL-2026-v3 | Standard Project Plan Template | 3.0 | 2026-01-01 | COMP-002 | S02 | Objectives | True | ≥1 measurable objective (SMART) | 0.10 |
| TPL-2026-v3 | Standard Project Plan Template | 3.0 | 2026-01-01 | COMP-003 | S03 | Milestones | True | All milestones have target dates | 0.12 |
| TPL-2026-v3 | Standard Project Plan Template | 3.0 | 2026-01-01 | COMP-004 | S04 | WBS\_Effort | True | Every WBS task has effort estimate | 0.13 |
| TPL-2026-v3 | Standard Project Plan Template | 3.0 | 2026-01-01 | COMP-005 | S05 | Resource\_Plan | True | Role × allocation table present | 0.13 |
| TPL-2026-v3 | Standard Project Plan Template | 3.0 | 2026-01-01 | COMP-006 | S06 | Dependencies | True | Dependency graph is acyclic | 0.12 |
| TPL-2026-v3 | Standard Project Plan Template | 3.0 | 2026-01-01 | COMP-007 | S07 | Risk\_RAID | True | ≥1 risk entry with severity + owner | 0.16 |
| TPL-2026-v3 | Standard Project Plan Template | 3.0 | 2026-01-01 | COMP-008 | S08 | Acceptance\_Criteria | True | Each deliverable has measurable AC | 0.12 |

## DS03_Resource_Allocation
| Member\_ID | Project\_ID | Role | Allocation\_pct | Start\_date | End\_date | Busy\_rate |
| --- | --- | --- | --- | --- | --- | --- |
| EMP-001 | PRJ-001 | BE | 0.60 | 2026-06-29 | 2026-08-07 | 1.15 |
| EMP-001 | PRJ-003 | BE | 0.55 | 2026-06-29 | 2026-08-07 | 1.15 |
| EMP-002 | PRJ-002 | DE | 0.90 | 2026-06-29 | 2026-08-07 | 0.90 |
| EMP-003 | PRJ-002 | ML | 1.00 | 2026-06-29 | 2026-08-07 | 1.00 |
| EMP-004 | PRJ-001 | BE | 0.80 | 2026-06-29 | 2026-08-07 | 1.25 |
| EMP-004 | PRJ-002 | BE | 0.45 | 2026-06-29 | 2026-08-07 | 1.25 |
| EMP-005 | PRJ-001 | DevOps | 0.30 | 2026-06-29 | 2026-08-07 | 0.60 |
| EMP-005 | PRJ-002 | DevOps | 0.30 | 2026-06-29 | 2026-08-07 | 0.60 |
| EMP-006 | PRJ-001 | Sec | 0.95 | 2026-06-29 | 2026-08-07 | 0.95 |
| EMP-007 | PRJ-002 | Design | 0.80 | 2026-06-29 | 2026-08-07 | 0.80 |
| EMP-008 | PRJ-002 | BA | 0.50 | 2026-06-29 | 2026-08-07 | 0.50 |
| EMP-009 | PRJ-002 | FE | 0.80 | 2026-07-13 | 2026-08-07 | 0.80 |
| EMP-010 | PRJ-001 | QA | 0.60 | 2026-06-29 | 2026-08-07 | 1.10 |
| EMP-010 | PRJ-002 | QA | 0.50 | 2026-06-29 | 2026-08-07 | 1.10 |
| EMP-103 | PRJ-103 | BE | 0.86 | 2026-06-29 | 2026-08-07 | 0.86 |
| EMP-104 | PRJ-102 | BA | 0.85 | 2026-06-29 | 2026-08-07 | 0.85 |
| EMP-105 | PRJ-106 | DevOps | 0.86 | 2026-06-29 | 2026-08-07 | 0.86 |
| EMP-106 | PRJ-103 | FE | 1.01 | 2026-06-29 | 2026-08-07 | 1.01 |
| EMP-107 | PRJ-104 | DE | 0.45 | 2026-06-29 | 2026-08-07 | 0.95 |
| EMP-107 | PRJ-102 | DE | 0.50 | 2026-06-29 | 2026-08-07 | 0.95 |
| EMP-108 | PRJ-102 | FE | 0.53 | 2026-06-29 | 2026-08-07 | 0.92 |
| EMP-108 | PRJ-103 | FE | 0.39 | 2026-06-29 | 2026-08-07 | 0.92 |
| EMP-109 | PRJ-108 | DevOps | 0.96 | 2026-06-29 | 2026-08-07 | 0.96 |
| EMP-110 | PRJ-101 | FE | 0.56 | 2026-06-29 | 2026-08-07 | 0.98 |
| EMP-110 | PRJ-105 | FE | 0.42 | 2026-06-29 | 2026-08-07 | 0.98 |
| EMP-111 | PRJ-105 | BA | 1.04 | 2026-06-29 | 2026-08-07 | 1.04 |
| EMP-112 | PRJ-105 | BA | 0.44 | 2026-06-29 | 2026-08-07 | 1.04 |
| EMP-112 | PRJ-102 | BA | 0.60 | 2026-06-29 | 2026-08-07 | 1.04 |
| EMP-113 | PRJ-106 | BE | 0.86 | 2026-06-29 | 2026-08-07 | 0.86 |
| EMP-114 | PRJ-102 | Design | 0.43 | 2026-06-29 | 2026-08-07 | 0.91 |
| EMP-114 | PRJ-108 | Design | 0.48 | 2026-06-29 | 2026-08-07 | 0.91 |
| EMP-115 | PRJ-102 | Design | 0.60 | 2026-06-29 | 2026-08-07 | 0.92 |
| EMP-115 | PRJ-105 | Design | 0.32 | 2026-06-29 | 2026-08-07 | 0.92 |
| EMP-116 | PRJ-105 | QA | 0.49 | 2026-06-29 | 2026-08-07 | 0.98 |
| EMP-116 | PRJ-104 | QA | 0.49 | 2026-06-29 | 2026-08-07 | 0.98 |
| EMP-117 | PRJ-102 | ML | 0.49 | 2026-06-29 | 2026-08-07 | 1.04 |
| EMP-117 | PRJ-106 | ML | 0.55 | 2026-06-29 | 2026-08-07 | 1.04 |
| EMP-118 | PRJ-101 | Design | 0.48 | 2026-06-29 | 2026-08-07 | 1.09 |
| EMP-118 | PRJ-105 | Design | 0.61 | 2026-06-29 | 2026-08-07 | 1.09 |

## DS04_Velocity_History
| Project\_ID | Project\_type | Sprint\_no | Sprint\_duration\_days | Planned\_points | Completed\_points | Velocity\_ratio | Team\_size | Outcome |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| PRJ-H-101 | Software/Migration | 1 | 14 | 40 | 34.0 | 0.8500 | 8 | Completed |
| PRJ-H-101 | Software/Migration | 2 | 14 | 40 | 36.0 | 0.9000 | 8 | Completed |
| PRJ-H-101 | Software/Migration | 3 | 14 | 40 | 38.0 | 0.9500 | 8 | Completed |
| PRJ-H-101 | Software/Migration | 4 | 14 | 40 | 38.0 | 0.9500 | 8 | Completed |
| PRJ-H-101 | Software/Migration | 5 | 14 | 40 | 38.0 | 0.9500 | 8 | Completed |
| PRJ-H-102 | Software/Migration | 1 | 14 | 40 | 36.8 | 0.9200 | 7 | Completed |
| PRJ-H-102 | Software/Migration | 2 | 14 | 40 | 38.0 | 0.9500 | 7 | Completed |
| PRJ-H-102 | Software/Migration | 3 | 14 | 40 | 38.4 | 0.9600 | 7 | Completed |
| PRJ-H-102 | Software/Migration | 4 | 14 | 40 | 38.0 | 0.9500 | 7 | Completed |
| PRJ-H-102 | Software/Migration | 5 | 14 | 40 | 38.8 | 0.9700 | 7 | Completed |
| PRJ-H-103 | AI/ML Platform | 1 | 14 | 40 | 32.8 | 0.8200 | 9 | Completed |
| PRJ-H-103 | AI/ML Platform | 2 | 14 | 40 | 35.2 | 0.8800 | 9 | Completed |
| PRJ-H-103 | AI/ML Platform | 3 | 14 | 40 | 36.8 | 0.9200 | 9 | Completed |
| PRJ-H-103 | AI/ML Platform | 4 | 14 | 40 | 37.2 | 0.9300 | 9 | Completed |
| PRJ-H-103 | AI/ML Platform | 5 | 14 | 40 | 38.0 | 0.9500 | 9 | Completed |
| PRJ-H-104 | AI/ML Platform | 1 | 14 | 40 | 35.2 | 0.8800 | 8 | Completed |
| PRJ-H-104 | AI/ML Platform | 2 | 14 | 40 | 36.8 | 0.9200 | 8 | Completed |
| PRJ-H-104 | AI/ML Platform | 3 | 14 | 40 | 37.6 | 0.9400 | 8 | Completed |
| PRJ-H-104 | AI/ML Platform | 4 | 14 | 40 | 38.0 | 0.9500 | 8 | Completed |
| PRJ-H-104 | AI/ML Platform | 5 | 14 | 40 | 38.4 | 0.9600 | 8 | Completed |
| PRJ-H-105 | Software | 1 | 14 | 40 | 36.0 | 0.9000 | 5 | Completed |
| PRJ-H-105 | Software | 2 | 14 | 40 | 37.2 | 0.9300 | 5 | Completed |
| PRJ-H-105 | Software | 3 | 14 | 40 | 38.0 | 0.9500 | 5 | Completed |
| PRJ-H-105 | Software | 4 | 14 | 40 | 38.4 | 0.9600 | 5 | Completed |
| PRJ-H-105 | Software | 5 | 14 | 40 | 38.4 | 0.9600 | 5 | Completed |
| PRJ-H-199 | AI/ML Platform | 1 | 7 | 40 | 40.0 | 1.0000 | 2 | Completed |
| PRJ-H-201 | Software/Migration | 1 | 14 | 40 | 39.8 | 0.9950 | 7 | Completed |
| PRJ-H-201 | Software/Migration | 2 | 14 | 40 | 38.4 | 0.9600 | 7 | Completed |
| PRJ-H-201 | Software/Migration | 3 | 14 | 40 | 37.0 | 0.9250 | 7 | Completed |
| PRJ-H-201 | Software/Migration | 4 | 14 | 40 | 40.1 | 1.0025 | 7 | Completed |
| PRJ-H-201 | Software/Migration | 5 | 14 | 40 | 39.3 | 0.9825 | 7 | Completed |
| PRJ-H-202 | Software/Migration | 1 | 14 | 40 | 36.2 | 0.9050 | 6 | Completed |
| PRJ-H-202 | Software/Migration | 2 | 14 | 40 | 37.0 | 0.9250 | 6 | Completed |
| PRJ-H-202 | Software/Migration | 3 | 14 | 40 | 35.2 | 0.8800 | 6 | Completed |
| PRJ-H-202 | Software/Migration | 4 | 14 | 40 | 36.3 | 0.9075 | 6 | Completed |
| PRJ-H-202 | Software/Migration | 5 | 14 | 40 | 34.8 | 0.8700 | 6 | Completed |
| PRJ-H-203 | Software | 1 | 14 | 40 | 38.2 | 0.9550 | 10 | Completed |
| PRJ-H-203 | Software | 2 | 14 | 40 | 35.1 | 0.8775 | 10 | Completed |
| PRJ-H-203 | Software | 3 | 14 | 40 | 34.4 | 0.8600 | 10 | Completed |
| PRJ-H-203 | Software | 4 | 14 | 40 | 38.2 | 0.9550 | 10 | Completed |
| PRJ-H-203 | Software | 5 | 14 | 40 | 36.9 | 0.9225 | 10 | Completed |
| PRJ-H-204 | Data | 1 | 14 | 40 | 37.8 | 0.9450 | 4 | Completed |
| PRJ-H-204 | Data | 2 | 14 | 40 | 34.6 | 0.8650 | 4 | Completed |
| PRJ-H-204 | Data | 3 | 14 | 40 | 34.6 | 0.8650 | 4 | Completed |
| PRJ-H-204 | Data | 4 | 14 | 40 | 34.3 | 0.8575 | 4 | Completed |
| PRJ-H-204 | Data | 5 | 14 | 40 | 37.4 | 0.9350 | 4 | Completed |
| PRJ-H-205 | Software | 1 | 14 | 40 | 38.6 | 0.9650 | 6 | Completed |
| PRJ-H-205 | Software | 2 | 14 | 40 | 39.2 | 0.9800 | 6 | Completed |
| PRJ-H-205 | Software | 3 | 14 | 40 | 36.0 | 0.9000 | 6 | Completed |
| PRJ-H-205 | Software | 4 | 14 | 40 | 37.4 | 0.9350 | 6 | Completed |
| PRJ-H-205 | Software | 5 | 14 | 40 | 39.6 | 0.9900 | 6 | Completed |
| PRJ-H-206 | Integration | 1 | 14 | 40 | 35.8 | 0.8950 | 4 | Completed |
| PRJ-H-206 | Integration | 2 | 14 | 40 | 35.6 | 0.8900 | 4 | Completed |
| PRJ-H-206 | Integration | 3 | 14 | 40 | 35.0 | 0.8750 | 4 | Completed |
| PRJ-H-206 | Integration | 4 | 14 | 40 | 34.8 | 0.8700 | 4 | Completed |
| PRJ-H-206 | Integration | 5 | 14 | 40 | 36.4 | 0.9100 | 4 | Completed |

## DS05_Historical_Projects
| Historical\_project\_id | Project\_type | Team\_size | Duration\_days | Planned\_duration\_days | Total\_effort\_days | Total\_budget\_scaled | Avg\_velocity\_ratio | Risk\_count | Key\_risks | PMO\_standard\_ver | Final\_outcome | Is\_outlier |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| PRJ-H-101 | Software/Migration | 8 | 240 | 225 | 180.0 | 8.6 | 0.920 | 5 | Legacy data migration; cutover risk | 2.1 | On Time | False |
| PRJ-H-102 | Software/Migration | 7 | 210 | 210 | 155.0 | 7.4 | 0.950 | 4 | Vendor API delay; scope creep | 2.1 | On Time | False |
| PRJ-H-103 | AI/ML Platform | 9 | 270 | 255 | 400.0 | 14.2 | 0.900 | 6 | Data quality; model drift | 2.2 | On Time | False |
| PRJ-H-104 | AI/ML Platform | 8 | 255 | 240 | 380.0 | 13.1 | 0.930 | 5 | Forecast accuracy; GPU capacity | 2.2 | On Time | False |
| PRJ-H-105 | Software | 5 | 120 | 120 | 88.0 | 4.0 | 0.940 | 3 | Integration dependency | 2.0 | On Time | False |
| PRJ-H-199 | AI/ML Platform | 2 | 15 | 14 | 15.0 | 0.6 | 1.000 | 0 | POC only — not representative | 2.2 | Completed | True |
| PRJ-H-201 | Software/Migration | 7 | 210 | 210 | 165.3 | 4.1 | 0.953 | 2 | Standard delivery risks | 2.1 | On Time | False |
| PRJ-H-202 | Software/Migration | 6 | 150 | 150 | 119.4 | 3.0 | 0.892 | 3 | Standard delivery risks | 2.1 | Delayed | False |
| PRJ-H-203 | Software | 10 | 240 | 210 | 172.4 | 4.3 | 0.907 | 3 | Standard delivery risks | 2.1 | Delayed | False |
| PRJ-H-204 | Data | 4 | 150 | 150 | 143.7 | 3.6 | 0.900 | 6 | Standard delivery risks | 2.1 | Delayed | False |
| PRJ-H-205 | Software | 6 | 120 | 105 | 82.9 | 2.1 | 0.945 | 3 | Standard delivery risks | 2.1 | On Time | False |
| PRJ-H-206 | Integration | 4 | 240 | 225 | 246.4 | 6.2 | 0.890 | 3 | Standard delivery risks | 2.1 | On Time | False |

## DS06_Plan_Section_Check
| Check\_ID | Plan\_ID | Component\_ID | Custom\_name | Status | Note |
| --- | --- | --- | --- | --- | --- |
| CHK-001 | PLAN-001 | COMP-001 | NaN | Complete | NaN |
| CHK-002 | PLAN-001 | COMP-002 | NaN | Complete | NaN |
| CHK-003 | PLAN-001 | COMP-003 | NaN | Complete | NaN |
| CHK-004 | PLAN-001 | COMP-004 | NaN | Complete | NaN |
| CHK-005 | PLAN-001 | COMP-005 | NaN | Complete | NaN |
| CHK-006 | PLAN-001 | COMP-006 | NaN | Complete | NaN |
| CHK-007 | PLAN-001 | COMP-007 | NaN | Complete | NaN |
| CHK-008 | PLAN-001 | COMP-008 | NaN | Complete | NaN |
| CHK-009 | PLAN-002 | COMP-001 | NaN | Complete | NaN |
| CHK-010 | PLAN-002 | COMP-002 | NaN | Complete | NaN |
| CHK-011 | PLAN-002 | COMP-003 | NaN | Complete | NaN |
| CHK-012 | PLAN-002 | COMP-004 | NaN | Complete | NaN |
| CHK-013 | PLAN-002 | COMP-005 | NaN | Weak | Present but thin — missing detailed role x allocation table |
| CHK-014 | PLAN-002 | COMP-006 | NaN | Complete | NaN |
| CHK-015 | PLAN-002 | COMP-007 | NaN | Missing | Risk Register entirely absent — Risk pillar defaults to Red |
| CHK-016 | PLAN-002 | COMP-008 | NaN | Weak | Acceptance criteria not measurable |
| CHK-017 | PLAN-002 | NaN | EVM\_Cost\_Tracking | Custom | PM's own section -> flag for PMO review, NOT a gap |
| CHK-018 | PLAN-101 | COMP-001 | NaN | Complete | NaN |
| CHK-019 | PLAN-101 | COMP-002 | NaN | Complete | NaN |
| CHK-020 | PLAN-101 | COMP-003 | NaN | Complete | NaN |
| CHK-021 | PLAN-101 | COMP-004 | NaN | Complete | NaN |
| CHK-022 | PLAN-101 | COMP-005 | NaN | Complete | NaN |
| CHK-023 | PLAN-101 | COMP-006 | NaN | Complete | NaN |
| CHK-024 | PLAN-101 | COMP-007 | NaN | Complete | NaN |
| CHK-025 | PLAN-101 | COMP-008 | NaN | Complete | NaN |
| CHK-026 | PLAN-102 | COMP-001 | NaN | Complete | NaN |
| CHK-027 | PLAN-102 | COMP-002 | NaN | Complete | NaN |
| CHK-028 | PLAN-102 | COMP-003 | NaN | Complete | NaN |
| CHK-029 | PLAN-102 | COMP-004 | NaN | Complete | NaN |
| CHK-030 | PLAN-102 | COMP-005 | NaN | Complete | NaN |
| CHK-031 | PLAN-102 | COMP-006 | NaN | Complete | NaN |
| CHK-032 | PLAN-102 | COMP-007 | NaN | Complete | NaN |
| CHK-033 | PLAN-102 | COMP-008 | NaN | Complete | NaN |
| CHK-034 | PLAN-103 | COMP-001 | NaN | Complete | NaN |
| CHK-035 | PLAN-103 | COMP-002 | NaN | Complete | NaN |
| CHK-036 | PLAN-103 | COMP-003 | NaN | Complete | NaN |
| CHK-037 | PLAN-103 | COMP-004 | NaN | Complete | NaN |
| CHK-038 | PLAN-103 | COMP-005 | NaN | Complete | NaN |
| CHK-039 | PLAN-103 | COMP-006 | NaN | Complete | NaN |
| CHK-040 | PLAN-103 | COMP-007 | NaN | Complete | NaN |
| CHK-041 | PLAN-103 | COMP-008 | NaN | Complete | NaN |
| CHK-042 | PLAN-104 | COMP-001 | NaN | Complete | NaN |
| CHK-043 | PLAN-104 | COMP-002 | NaN | Complete | NaN |
| CHK-044 | PLAN-104 | COMP-003 | NaN | Complete | NaN |
| CHK-045 | PLAN-104 | COMP-004 | NaN | Complete | NaN |
| CHK-046 | PLAN-104 | COMP-005 | NaN | Complete | NaN |
| CHK-047 | PLAN-104 | COMP-006 | NaN | Complete | NaN |
| CHK-048 | PLAN-104 | COMP-007 | NaN | Complete | NaN |
| CHK-049 | PLAN-104 | COMP-008 | NaN | Complete | NaN |

## DS07_Project_Plan_Summary
| Plan\_ID | Project\_ID | Project\_name | Plan\_set | Effort\_MD | Duration\_months | Velocity\_MD\_month | Team\_size | Risk\_count | Top\_risk\_score | THI\_pct | Peak\_role\_busy\_rate\_pct | On\_time\_history\_pct | Feasibility\_status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| PLAN-001 | PRJ-001 | Project Orion (Core Banking) | To\_Review | 168.0 | 7 | 24.0 | 16 | 5 | 20.0 | 18.0 | 95 | 92 | Feasible (Green) |
| PLAN-002 | PRJ-002 | Energent AI (Data Platform) | To\_Review | 426.0 | 9 | 47.3 | 10 | 0 | NaN | 9.0 | 135 | 90 | Not feasible (Red): missing Risk Register; capacity gap (peak busy ~135%); THI 9% (<10%); weak Resource/Acceptance |
| PLAN-101 | PRJ-101 | Project Apollo | To\_Review | 157.5 | 7 | 22.5 | 6 | 6 | 8.0 | 18.9 | 103 | 94 | Feasible (Green) |
| PLAN-102 | PRJ-102 | Project Vega | To\_Review | 180.0 | 8 | 22.5 | 8 | 4 | 10.0 | 21.8 | 108 | 89 | Feasible (Green) |
| PLAN-103 | PRJ-103 | Project Lyra | To\_Review | 180.0 | 8 | 22.5 | 8 | 6 | 13.0 | 21.2 | 89 | 91 | Feasible (Green) |
| PLAN-104 | PRJ-104 | Project Draco | To\_Review | 140.0 | 5 | 28.0 | 12 | 4 | 13.0 | 17.9 | 96 | 93 | Feasible (Green) |

## DS08_Role_Capacity
| Capacity\_ID | Role | Headcount | Capacity\_MD\_month | Busy\_rate\_pct | Available\_MD\_month | Note |
| --- | --- | --- | --- | --- | --- | --- |
| CAP-01 | Backend Developer | 8 | 176 | 92 | 14 | Near full |
| CAP-02 | Data Engineer | 5 | 110 | 78 | 24 | Some headroom |
| CAP-03 | ML Engineer | 4 | 88 | 85 | 13 | Fairly busy (many M2 tasks) |
| CAP-04 | DevOps | 3 | 66 | 70 | 20 | OK |
| CAP-05 | Frontend Developer | 4 | 88 | 60 | 35 | Good headroom (recent hires) |
| CAP-06 | QA Engineer | 4 | 88 | 75 | 22 | OK |
| CAP-07 | UX/UI Designer | 3 | 66 | 65 | 23 | OK |
| CAP-08 | Security Engineer | 2 | 44 | 95 | 2 | Bottleneck — PCI/audit |
| CAP-09 | Business Analyst | 2 | 44 | 55 | 20 | Good headroom |
| CAP-10 | Project Manager | 3 | 66 | 80 | 13 | OK |

## REF_Member_Master
| Shared master — identical rows appear in PMO\_02 file. | Unnamed: 1 | Unnamed: 2 | Unnamed: 3 | Unnamed: 4 | Unnamed: 5 |
| --- | --- | --- | --- | --- | --- |
| Member\_ID | Full\_name | Role\_title | Department | Employment | Std\_hours\_week |
| EMP-001 | Nguyen Van An | Backend Developer | Backend | FT | 40 |
| EMP-002 | Tran Thi Bich | Data Engineer | Data | FT | 40 |
| EMP-003 | Le Van Cuong | ML Engineer | AI/ML | FT | 40 |
| EMP-004 | Pham Thi Dung | Backend Lead | Backend | FT | 40 |
| EMP-005 | Hoang Van Em | DevOps Engineer | Platform | FT | 40 |
| EMP-006 | Do Van Khoa | Security Engineer | Security | FT | 40 |
| EMP-007 | Bui Thi Hoa | UX/UI Designer | Design | PT | 20 |
| EMP-008 | Ngo Thi Lan | Business Analyst | BA | FT | 40 |
| EMP-009 | Ly Van Minh | Frontend Developer | Frontend | FT | 40 |
| EMP-010 | Truong Thi Nga | QA Engineer | QA | FT | 40 |
| EMP-011 | Vu Thi Mai | Engineering Manager | Engineering | FT | 40 |
| EMP-012 | Dang Van Phuc | PMO Lead / PM | PMO | FT | 40 |
| EMP-101 | Le Anh Tuan | Project Manager | PMO | FT | 40 |
| EMP-102 | Dao Chi Nam | Project Manager | PMO | FT | 40 |
| EMP-103 | Hoang Hieu Nam | Backend Developer | Backend | FT | 40 |
| EMP-104 | Do My Quan | Business Analyst | BA | FT | 40 |
| EMP-105 | Do Trang Binh | DevOps Engineer | Platform | FT | 40 |
| EMP-106 | Do Yen Quynh | Frontend Developer | Frontend | FT | 40 |
| EMP-107 | Ho Hung Thao | Data Engineer | Data | FT | 40 |
| EMP-108 | Phan Nhung My | Frontend Developer | Frontend | FT | 40 |
| EMP-109 | Phan Ha Ha | DevOps Engineer | Platform | FT | 40 |
| EMP-110 | Pham Trang Anh | Frontend Developer | Frontend | FT | 40 |
| EMP-111 | Do Anh Hieu | Business Analyst | BA | FT | 40 |
| EMP-112 | Ngo Tuan Hieu | Business Analyst | BA | FT | 40 |
| EMP-113 | Pham Ha Viet | Backend Developer | Backend | PT | 20 |
| EMP-114 | Tran Long Giang | UX/UI Designer | Design | PT | 20 |
| EMP-115 | Cao Nam Long | UX/UI Designer | Design | FT | 40 |
| EMP-116 | Cao Ngan Thao | QA Engineer | QA | FT | 40 |
| EMP-117 | Duong Dat Chi | ML Engineer | AI/ML | FT | 40 |
| EMP-118 | Duong Nhung Binh | UX/UI Designer | Design | FT | 40 |

## REF_Project_Master
| Shared master — identical rows appear in PMO\_02 file. | Unnamed: 1 | Unnamed: 2 | Unnamed: 3 | Unnamed: 4 |
| --- | --- | --- | --- | --- |
| Project\_ID | Project\_name | Project\_type | Status | Is\_historical |
| PRJ-001 | Project Orion (Core Banking) | Software/Migration | Active | False |
| PRJ-002 | Energent AI (Data Platform) | AI/ML Platform | Active | False |
| PRJ-003 | Project Titan (Internal Tools) | Software | Active | False |
| PRJ-H-101 | Mercury Core Migration | Software/Migration | Completed | True |
| PRJ-H-102 | Saturn Banking Upgrade | Software/Migration | Completed | True |
| PRJ-H-103 | Comet ML Pipeline | AI/ML Platform | Completed | True |
| PRJ-H-104 | Nebula Forecast Engine | AI/ML Platform | Completed | True |
| PRJ-H-105 | Pulsar CRM | Software | Completed | True |
| PRJ-H-199 | Flux POC | AI/ML Platform | Completed | True |
| PRJ-101 | Project Apollo | Software/Migration | Active | False |
| PRJ-102 | Project Vega | Software | Active | False |
| PRJ-103 | Project Lyra | Software/Migration | Active | False |
| PRJ-104 | Project Draco | Integration | Active | False |
| PRJ-105 | Project Orbit | Integration | Active | False |
| PRJ-106 | Project Helios | Software/Migration | Active | False |
| PRJ-107 | Project Atlas | Mobile | Active | False |
| PRJ-108 | Project Zephyr | Data | Active | False |
| PRJ-H-201 | Project Zephyr (archived) | Software/Migration | Completed | True |
| PRJ-H-202 | Project Cobalt (archived) | Software/Migration | Completed | True |
| PRJ-H-203 | Project Quartz (archived) | Software | Completed | True |
| PRJ-H-204 | Project Nimbus (archived) | Data | Completed | True |
| PRJ-H-205 | Project Cedar (archived) | Software | Completed | True |
| PRJ-H-206 | Project Falcon (archived) | Integration | Completed | True |

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
| F-01 | Problem 1 | Plan | PLAN-002 | Missing\_section | Risk Register (S07) missing -> Risk pillar defaults to Red | High |
| F-02 | Problem 1 | Plan | PLAN-002 | Weak\_section | Resource\_Plan & Acceptance\_Criteria are thin | Medium |
| F-03 | Problem 1 | Plan | PLAN-002 | Feasibility | Peak role busy ~135% + THI 9% (<10%) | High |
| F-04 | Problem 1 | Plan | PLAN-002 | Custom\_section | EVM\_Cost\_Tracking is custom -> flag for review, NOT a gap | Info |
| F-05 | Problem 1 | Plan | PLAN-001 | Baseline\_OK | All 8 sections present; velocity 24 matches Migration benchmark ~22.5 -> feasible | Info |
| F-06 | Problem 1 | Benchmark | PRJ-H-199 | Benchmark\_outlier | Exclude from benchmark (15 MD/0.5mo, too small) | Info |
| F-1C | Problem 1 | Plan | PLAN-002 | Dependency\_cycle | Cycle TASK-E07<->TASK-E08 + test-before-build (E06) | High |