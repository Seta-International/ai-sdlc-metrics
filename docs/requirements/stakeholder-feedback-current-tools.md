# Stakeholder Feedback: Current Internal Tools

> Source: "Current internal apps — stakeholder survey"
> Collected from: Bich Ngoc (Hiring), Nhung Nguyen (EMS), Hang Mai (Timesheet), Ly Nguyen (Review & Audit)

---

## 1. Tool Overview

| Tool      | Stakeholder  | Business Purpose                                                                                                                                                                                                | Primary User Groups                           |
| --------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Hiring    | Bich Ngoc    | Build and leverage a long-term talent pool; standardize and track the recruitment pipeline; accelerate hiring and reduce manual effort; data-driven hiring (conversion rate, time-to-hire, etc.)                | TA Team, CPO, BOD                             |
| EMS       | Nhung Nguyen | Single source of truth for HR data; manage employee lifecycle (onboard → offboard); support staffing & resource allocation; manage contracts & legal information; provide data for operations & decision-making | TA Team, HR, CPO, Techlead, PM, BOD, Employee |
| Timesheet | Hang Mai     | Accurate attendance tracking (check-in/out, biometric); support related workflows (leave, forget punches, make-up shifts); input source for payroll & compliance; track discipline & working behavior           | Employee, CPO                                 |
| Review    | Ly Nguyen    | Periodic performance tracking; identify top/low performers; basis for reward, promotion, improvement plans; increase transparency in evaluations                                                                | Leader, PM, Employee                          |
| Audit     | Ly Nguyen    | Compliance control (log work, reports, process adherence); detect operational risks; increase discipline and standardize working methods; provide insight for process improvement                               | Employee, Leader, PM                          |

---

## 2. Hiring Tool

### Features & Flows

| Feature                                     | Flow Description                                                                                             | End Users           | Usage Frequency | Priority  | Pain Points                                                                                                                                                              | Improvement Requests                                  | Decision |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------- | --------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- | -------- |
| Create recruitment request                  | Hiring manager or TA leader creates a recruitment request                                                    | Hiring Manager / TA | Daily           | Must Keep | Time filter for recruitment requests works incorrectly                                                                                                                   | Fix time-range filter                                 | Keep     |
| Create recruitment request with job posting | When creating a request with a specific JD and public visibility, the job is published to SETA's career site | TA                  | Daily           | Must Keep | Job must also be posted manually to paid job boards, LinkedIn, Facebook, etc.                                                                                            | —                                                     | Keep     |
| Upload CVs / Import & export candidate data | AI parses CVs to populate basic fields and attaches the CV file                                              | TA                  | Daily           | Must Keep | OpenAI key not yet approved by finance — costs $5 for ~1,200 CVs; blocking for TA efficiency. Filter by phone number / email is missing, making candidate search harder. | Add filter by phone and email fields                  | Keep     |
| Talent pool                                 | Store candidate data and create talent pools for future hiring needs                                         | HR                  | Daily           | Must Keep | —                                                                                                                                                                        | —                                                     | Keep     |
| AI candidate matching                       | AI suggests CVs matching open positions                                                                      | HR                  | Daily           | Must Keep | Interview evaluation data is stored in Google Forms and must be manually copied to Google Sheets                                                                         | —                                                     | Keep     |
| Recruitment pipeline (apply → offer)        | Record interview rounds and results                                                                          | HR                  | Daily           | Must Keep | Candidate status and contact info tracked in Google Sheets separately                                                                                                    | —                                                     | Keep     |
| Interview scheduling                        | Send interview invitations, schedule interviews, book meeting rooms                                          | HR                  | Daily           | Must Keep | Separate Google Calendar used for scheduling                                                                                                                             | —                                                     | Keep     |
| Interview calendar view                     | Display all scheduled and past interviews                                                                    | HR                  | Daily           | Must Keep | Requires Google Calendar alongside                                                                                                                                       | —                                                     | Keep     |
| Management reporting                        | Recruitment reports                                                                                          | HR                  | Weekly          | Must Keep | No complete report currently; current data count is inaccurate                                                                                                           | Rebuild reporting to be accurate and fit actual needs | Fix      |
| System settings                             | Add projects, talent pools, manage permissions                                                               | HR                  | Daily           | Must Keep | —                                                                                                                                                                        | —                                                     | Keep     |
| Web crawling                                | Automatically source candidates (primarily LinkedIn)                                                         | HR                  | Daily           | Must Keep | External tools still needed; this feature helps diversify candidate sources                                                                                              | —                                                     | Keep     |
| Candidate onboarding handoff                | Candidates with "Offered" status should be transferred to EMS to initiate the onboarding process             | —                   | —               | —         | No current integration                                                                                                                                                   | Build integration with EMS                            | **New**  |

---

## 3. EMS (Employee Management System)

### Features & Flows

| Feature                                  | Flow Description                                                                                         | End Users                   | Usage Frequency | Priority                       | Pain Points                                                                                                        | Improvement Requests                                                                               | Decision |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------- | --------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | -------- |
| Employee onboarding — account creation   | Create account and sync to Timesheet, Review, Audit; notify IT team via Teams for approval               | HR, IT                      | Weekly          | Cross-System Integration Issue | Sync failures require manual re-entry in 3 separate tools; webhook calls to other apps fail frequently             | Fix webhook reliability                                                                            | Fix      |
| Employee onboarding — task assignment    | Notify stakeholders to complete onboarding tasks (PM, IT, etc.)                                          | All onboarding stakeholders | Weekly          | Hidden Manual Work             | Jira used to create IT setup requests manually                                                                     | Add task assignment for stakeholders on each new onboarding                                        | Fix      |
| Employee profile management              | Manage all employee information: personal details, work history, tech stack; export CV in company format | HR, Employee, L&D           | Monthly         | Must Keep                      | HR still uses Microsoft Forms for new-hire data collection; contracts and onboarding data tracked in Google Sheets | Add periodic profile update requests (every 2 months / quarter); consolidate to single data source | Fix      |
| Account / Project catalog management     | Track list of active accounts and projects; per-account/project dashboards                               | BOD, CDO, CTO, PM, PMO      | Daily           | Must Fix                       | Data stored in scattered, incomplete, non-updated Google Sheets                                                    | Add company-wide account/project dashboard and export reports for PM & CDO                         | **New**  |
| Employee allocation per project (effort) | Track total and per-project effort allocation for all employees                                          | BOD, HR, CDO, CTO, PM, PMO  | Daily           | Must Fix                       | Must navigate into each account/project individually to see effort                                                 | Add a company-wide staffing overview table; add export for CPO                                     | **New**  |
| Contract template management             | Create and manage contract templates                                                                     | HR                          | Daily           | Hidden Manual Work             | Still requires Word/Excel mail merge                                                                               | —                                                                                                  | Keep     |
| Contract creation & lifecycle management | Generate contracts; track status (expiring, expired); remind HR about renewals                           | HR                          | Daily           | Hidden Manual Work             | Contract data accuracy depends on centralized HR data being correct                                                | —                                                                                                  | Fix      |
| Employee offboarding (self-initiated)    | Employee submits resignation on-system and follows the offboarding checklist per policy                  | Employee, HR                | Weekly          | Cross-System Integration Issue | Multiple manual steps: Teams notifications, Jira IT requests, Outlook resignation emails                           | —                                                                                                  | Fix      |
| Employee offboarding (HR-initiated)      | HR proactively initiates and manages the offboarding process for an employee                             | HR                          | Weekly          | Cross-System Integration Issue | —                                                                                                                  | —                                                                                                  | Fix      |
| Employee deletion                        | When an employee offboards, remove them from the system                                                  | HR                          | Weekly          | Must Fix                       | Deletion in EMS is not synced to other tools                                                                       | Sync deletion across Timesheet, Review, Audit to ensure consistent employee records                | Fix      |

---

## 4. Review Tool

### Features & Flows

| Feature                             | Flow Description                                                                                                                                                                    | End Users  | Usage Frequency | Priority                       | Pain Points                                                                                                       | Improvement Requests                                                                                                                            | Decision              |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | --------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| Add employee to system              | Create / edit employee records                                                                                                                                                      | HR         | Monthly         | Cross-System Integration Issue | EMS sync only supports SETA employees; BlueOC staff must be added manually; Google Sheets used for leader mapping | Sync employee data (ID, name, project, leader) across all tools                                                                                 | Fix                   |
| Assign / change reviewer            | Assign performance reviewers and update on request                                                                                                                                  | HR         | Monthly         | Must Fix                       | PM/Leader change requests come in via Teams messages to HR                                                        | Each employee should have: a performance reviewer (PM/Techlead/Leader) and a timesheet approver (usually PM). Both must be synced across tools. | Fix                   |
| PM / Leader request reviewer change | Request admin to change reviewer                                                                                                                                                    | PM, Leader | Monthly         | Nice to Have                   | —                                                                                                                 | —                                                                                                                                               | **Remove**            |
| Leader / PM evaluates employee      | Evaluate against predefined criteria; store evaluation history                                                                                                                      | PM, Leader | Monthly         | Must Fix                       | —                                                                                                                 | —                                                                                                                                               | Keep                  |
| Select evaluation cycle             | Select current or historical evaluation cycle to ensure correct month attribution (previously, evaluations done in early next month were logged as that month, causing data errors) | PM, Leader | Monthly         | Nice to Have                   | —                                                                                                                 | —                                                                                                                                               | _(No final decision)_ |
| Gold board / watchlist selection    | Tick employees into the "top performers" or "needs improvement" lists                                                                                                               | HR         | Monthly         | Automation Opportunity         | Evaluation data must be downloaded as Excel and analyzed manually                                                 | Add AI to suggest top performers and employees needing improvement                                                                              | Fix                   |
| Delete employee                     | Remove employee from system                                                                                                                                                         | —          | Monthly         | Must Fix                       | Deletion not synced with other tools                                                                              | Sync employee deletion across all tools                                                                                                         | Fix                   |
| Employee self-evaluation            | Employee evaluates themselves using the same criteria as the leader; the two evaluations are independent                                                                            | Employee   | Monthly         | Must Keep                      | —                                                                                                                 | —                                                                                                                                               | **New**               |
| _(Unnamed feature)_                 | —                                                                                                                                                                                   | —          | —               | —                              | —                                                                                                                 | —                                                                                                                                               | **New**               |

---

## 5. Timesheet

### Features & Flows

| Feature                                                   | Flow Description                                                               | End Users    | Usage Frequency | Priority               | Pain Points                                                                                                                                            | Improvement Requests                                                     | Decision |
| --------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------ | --------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ | -------- |
| Create employee                                           | Create employee record; assign PM/leader as timesheet approver                 | HR           | —               | Automation Opportunity | —                                                                                                                                                      | —                                                                        | Keep     |
| Employee setup                                            | Set working hours, work arrangement; set leave allowance; store biometric data | HR           | On offboarding  | Automation Opportunity | —                                                                                                                                                      | —                                                                        | Fix      |
| Create attendance requests (forget punch, make-up, leave) | Employee submits request → PM/Leader approves → CPO approves                   | Employee, HR | —               | Must Keep              | —                                                                                                                                                      | —                                                                        | Keep     |
| Attendance tracking                                       | Monitor check-in/out times for all employees; track leave usage                | Employee, HR | —               | Must Fix               | —                                                                                                                                                      | Add AI-assisted analysis and warnings for employees with poor attendance | **New**  |
| Change timesheet approver                                 | Update PM/leader who approves timesheets directly in Timesheet                 | HR           | —               | Must Fix               | Changes only apply within Timesheet, not synced to other tools                                                                                         | Sync approver changes across all tools                                   | Fix      |
| Delete employee                                           | Remove employee from system on offboarding                                     | HR           | —               | Must Fix               | Deletion not synced with other tools                                                                                                                   | Sync deletion across all tools                                           | Fix      |
| Working-days calculation                                  | Export check-in/out data and leave days for payroll                            | CPO          | —               | Must Keep              | Late arrivals, night meetings still handled manually; approvals via email then manually entered into Excel; number format in export file needs cleanup | Fix export formatting; automate edge cases                               | Fix      |
| Labor report export                                       | Export reports per HR-provided template                                        | CPO          | —               | Nice to Have           | —                                                                                                                                                      | —                                                                        | **New**  |
| Insurance report export                                   | Export to Excel for bulk upload into insurance software                        | CPO          | —               | Nice to Have           | Requires separate insurance software                                                                                                                   | —                                                                        | **New**  |

---

## 6. Audit Tool

### Features & Flows

| Feature                                 | Flow Description                                                                                                                                         | End Users | Usage Frequency | Priority                       | Pain Points                                                               | Improvement Requests                | Decision |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | --------------- | ------------------------------ | ------------------------------------------------------------------------- | ----------------------------------- | -------- |
| Add employee                            | Create employee record; assign PM/leader/project                                                                                                         | HR        | Monthly         | Cross-System Integration Issue | EMS sync only covers SETA employees; BlueOC staff require manual entry    | Sync employee data across all tools | Fix      |
| Automated violation tracking            | Auto-track violations via Jira, Teams, Review Tool: Teams status when on leave; Jira log work / code commits; late or missing monthly review evaluations | HR        | Daily           | Must Keep                      | Jira data is unreliable; many false positives require manual verification | Improve Jira integration accuracy   | Fix      |
| Manual violation logging                | Log violations that cannot be automated (e.g., repeated tardiness over a long period, project security exposure)                                         | HR        | Monthly         | Must Keep                      | —                                                                         | —                                   | Keep     |
| Automated violation notification emails | On detection, tool auto-sends acknowledgment email to employee → 24-hour window for explanation → if no response, a conclusion email is sent             | HR        | Daily           | Must Keep                      | —                                                                         | —                                   | Keep     |
| Violation status report                 | Compliance violation summary report                                                                                                                      | HR        | Monthly         | Nice to Have                   | Data exported to Excel to calculate remaining compliance bonus            | —                                   | Keep     |
| Delete employee                         | Remove employee from system on offboarding                                                                                                               | HR        | —               | Cross-System Integration Issue | —                                                                         | —                                   | **New**  |

---

## 7. New Modules Requested

### Planner

| Feature                              | Description                                                                                                                                            | End Users | Decision |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- | -------- |
| Meeting governance                   | Ensure meetings follow proper process: appropriate duration, full agenda prepared in advance, MoM recorded and stored, follow-up action items assigned | —         | **New**  |
| Action item creation                 | Create action items from meetings                                                                                                                      | Employee  | **New**  |
| Task reminders                       | Track and remind about incomplete or near-deadline tasks                                                                                               | —         | **New**  |
| Task completion as performance input | Evaluate task completion rate as one source for performance assessment                                                                                 | —         | **New**  |

### Goals / KPI

| Feature                         | Description                                                                                                                                                                              | End Users | Decision |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | -------- |
| KPI framework setup             | OKR → KPI system with weights; applicable per role/level; supports both self-rated and client-rated metrics; review mechanism; cross-app data reading (Timesheet, Review, Finance, etc.) | —         | **New**  |
| Individual KPI setup            | Set up KPI targets for each employee                                                                                                                                                     | —         | **New**  |
| Periodic performance evaluation | Leader/PM evaluates employee against KPIs periodically                                                                                                                                   | —         | **New**  |
| Automated KPI data collection   | Auto-pull data from Jira, Planner, and other tools to support KPI evaluation                                                                                                             | —         | **New**  |

### Insights

| Feature             | Description                                                                | End Users | Decision |
| ------------------- | -------------------------------------------------------------------------- | --------- | -------- |
| Cross-app analytics | Define required insights and decision-making dashboards across all modules | —         | **New**  |

### Finance

| Feature           | Description | End Users | Decision |
| ----------------- | ----------- | --------- | -------- |
| _(To be defined)_ | —           | —         | —        |

### Training (L&D)

| Feature             | Description                                                                                                                                           | End Users     | Decision |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | -------- |
| Learning management | Store learning materials; track employee learning/teaching activity and progress; serve as a basis for KPI evaluation; measure training effectiveness | Employee, L&D | **New**  |

---

## 8. Cross-Cutting Issues Summary

### 8.1 Data Sync & Integration (Critical)

All four tools (EMS, Timesheet, Review, Audit) maintain **separate employee records** that are not synchronized. Every employee addition, update, or deletion must be performed manually in each tool. This is the single most cited pain point.

**Required:** A single employee master record in EMS that propagates changes (create, update, delete) to all other tools automatically.

### 8.2 Tool Fragmentation

| Parallel Tools Currently Required | Used For                                                                                    |
| --------------------------------- | ------------------------------------------------------------------------------------------- |
| Google Sheets                     | Candidate data, staffing, leader mapping, evaluation analysis, contract data, labor reports |
| Google Forms                      | Post-interview evaluation forms                                                             |
| Google Calendar                   | Interview scheduling                                                                        |
| Microsoft Forms                   | Collecting new-hire personal data for contracts                                             |
| Microsoft Teams                   | Change-reviewer requests, onboarding/offboarding notifications                              |
| Jira                              | IT provisioning requests (onboarding/offboarding)                                           |
| Outlook                           | Resignations, late-punch approvals                                                          |
| Word / Excel (mail merge)         | Contract generation                                                                         |
| Insurance software                | Insurance reporting                                                                         |

### 8.3 AI Opportunities Identified

| Module    | Opportunity                                                                |
| --------- | -------------------------------------------------------------------------- |
| Hiring    | AI CV parsing (currently blocked by OpenAI key budget approval)            |
| Hiring    | AI candidate-to-job matching                                               |
| Review    | AI-assisted suggestion of top performers and employees needing improvement |
| Timesheet | AI attendance analysis and early-warning for chronic tardiness             |
| KPI/Goals | Automated KPI scoring from cross-app data                                  |

### 8.4 Priority Matrix

| Priority Tag                   | Meaning                                                                |
| ------------------------------ | ---------------------------------------------------------------------- |
| Must Keep                      | Feature works; preserve as-is                                          |
| Must Fix                       | Feature exists but has critical bugs or causes significant manual work |
| Must Fix (new)                 | Capability is entirely missing and business-critical                   |
| Automation Opportunity         | Manual today; a clear automation win in Future                         |
| Cross-System Integration Issue | Works in isolation but fails due to missing inter-tool sync            |
| Nice to Have                   | Low urgency; add when capacity allows                                  |
| Remove                         | No longer needed                                                       |
