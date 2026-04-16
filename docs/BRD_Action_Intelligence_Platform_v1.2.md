# Business Requirements Document

## Action Intelligence Platform — MVP

|                  |                                                                                                                             |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Version**      | 1.2 (voice simplified to Teams transcripts; tiered HITL; phased rollout)                                                    |
| **Status**       | Draft for Committee Review                                                                                                  |
| **Date**         | 16 April 2026                                                                                                               |
| **Prepared by**  | Technology & AI Strategy Office                                                                                             |
| **Prepared for** | SETA / BlueOC Leadership Committee                                                                                          |
| **Supersedes**   | _Action Intelligence Platform Proposal v2.0_ (10 April 2026). This BRD is authoritative where it differs from the proposal. |

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Business Context & Problem Statement](#2-business-context--problem-statement)
3. [Objectives & Strategic Alignment](#3-objectives--strategic-alignment)
4. [Scope](#4-scope)
5. [Solution Overview](#5-solution-overview)
6. [User Roles & Permissions](#6-user-roles--permissions)
7. [Functional Requirements](#7-functional-requirements)
8. [Non-Functional Requirements](#8-non-functional-requirements)
9. [Integration Requirements](#9-integration-requirements)
10. [Data & Privacy Considerations](#10-data--privacy-considerations)
11. [Dependencies](#11-dependencies)
12. [Assumptions](#12-assumptions)
13. [Risks & Mitigations](#13-risks--mitigations)
14. [Delivery Approach](#14-delivery-approach)
15. [Governance & Rollout](#15-governance--rollout)
16. [Intentionally Excluded from This BRD](#16-intentionally-excluded-from-this-brd)
17. [Next Steps — What Approval Enables](#17-next-steps--what-approval-enables)
18. [Open Questions for the Committee](#18-open-questions-for-the-committee)
19. [Appendix A — Glossary](#appendix-a--glossary)
20. [Appendix B — Relationship to Original Proposal](#appendix-b--relationship-to-original-proposal)

---

## 1. Executive Summary

SETA operates with approximately 400 staff across concurrent projects, yet has no centralised system to capture, assign, track, or follow up on action items arising from meetings. Actions go untracked. Follow-through is inconsistent. Accountability is diffuse. Cross-project visibility requires manual compilation.

This document requests committee approval to build the **Action Intelligence Platform MVP** — a single web application, structured as a monorepo on AWS. The monorepo comprises a shared **Core** base layer (reusable infrastructure) and three user-facing modules: **Planner module** (action management and PMO views), **Agent module** (AI extraction from Microsoft Teams meeting transcripts, with tiered human-in-the-loop review), and **Mail module** (outbound email gateway). Microsoft 365 integration uses three MS Graph surfaces: Microsoft Planner (bidirectional sync), Teams meeting transcripts (read-only, the sole voice input), and Entra ID directory (read-only, for user identity).

The MVP is built by three parallel sub-teams over **one calendar month**, then rolled out in stages: a **4-week pilot** with a single team, followed by **phased waves by department (2 weeks each)**, reaching full organisational coverage approximately **10 weeks after build completes**. Total timeline from committee approval to full coverage is approximately 14 weeks.

The Agent module operates on a **tiered human-in-the-loop model**. Low-risk activity — such as reminder emails sent to the owner of their own action — is autonomous. High-risk activity — creating new action items, modifying existing action items, sending escalation emails to managers, and writing to external systems — runs through a review queue and requires human confirmation before taking effect. A full audit log is maintained regardless.

The approval being requested is for **time and headcount only** — no infrastructure cost envelope is presented, and formal success KPIs are deferred to post-BRD measurement planning (a baseline will be established from Week 1 of pilot operation).

---

## 2. Business Context & Problem Statement

SETA's execution pain is widely felt but not formally documented. Based on consistent leadership, PMO, and staff observation, the following patterns recur:

- **Formal meeting actions** are captured inconsistently — sometimes in a Teams chat, sometimes in a meeting note, sometimes nowhere. There is no authoritative store.
- **Email-agreed actions** live inside individual inboxes with no shared visibility. Follow-up depends entirely on the owner remembering.
- **Conversation actions that happen outside Teams meetings** (hallway discussions, stand-up debriefs, brief calls) are lost outright. The MVP does not attempt to capture these; it focuses on the structured Teams meeting channel.
- **Evidence of completion** is rarely attached to any action. "Done" currently means the owner said it's done.
- **Portfolio-level visibility** at PMO and leadership level requires manual compilation across scattered sources.

This MVP deliberately does **not** attempt to quantify this pain upfront. Instead, baseline measurement (action volume, completion rate, overdue rate, evidence compliance, source-of-action mix) will be established **from Week 1 of pilot operation**, giving the organisation a data foundation from which to demonstrate improvement and drive future iterations. Committee approval of this BRD is sought on the basis of this qualitative case and the strategic alignment in Section 3.

---

## 3. Objectives & Strategic Alignment

The MVP serves three business objectives:

1. **Create a single source of truth for action items** across SETA — regardless of whether the action originates in a Teams meeting or manual entry.
2. **Introduce AI-assisted execution intelligence** through an agent that extracts candidate actions from Teams meeting transcripts and handles low-risk follow-up autonomously, while routing higher-risk activity through human review.
3. **Establish the organisational execution dataset** on which future analytics, performance evaluation, and (optionally) commercialisation can be built.

The platform directly advances SETA's stated strategic pillars:

- **PMO Governance** — complete visibility into execution status across projects and departments
- **AI-First Operating Model** — a practical AI agent shipping in production with sensible guardrails
- **Agentic Systems Pattern** — establishes the internal pattern for future AI-native tools across SETA's SDLC, including the review-queue pattern for human-AI collaboration
- **Future Revenue Optionality** — the architecture does not preclude commercialisation, but commercialisation is out of scope for this MVP

---

## 4. Scope

### 4.1 In-Scope

The MVP delivers a single web application — a monorepo on AWS — comprising a shared **Core** base layer and three user-facing modules: **Planner module**, **Agent module**, and **Mail module**. Per-module functional scope is detailed in Section 7.

Microsoft 365 integration is **limited to three surfaces, all accessed via MS Graph API**:

- **Microsoft Planner** — bidirectional task synchronisation
- **Microsoft Teams** — read-only access to meeting transcripts (the sole voice input for Agent extraction)
- **Microsoft Entra ID / MS365 directory** — read-only access for user identity and attributes

The monorepo does **not** push notification messages into Teams. Notifications in MVP are email + in-app only.

### 4.2 Out-of-Scope

The following are **explicitly excluded** from MVP. Several may be considered for future phases.

1. Microsoft Lists integration
2. Microsoft Loop components
3. Power Automate workflows
4. Teams message notifications (email + in-app only in MVP)
5. Dedicated Data Platform / analytics warehouse module (the Planner module provides built-in PMO views instead)
6. Vietnamese language support (post-MVP)
7. Native mobile applications (iOS / Android)
8. **Direct audio / voice capture** — no desktop microphone recording, no file upload of audio, no OpenAI Whisper. The Agent's voice input is exclusively Microsoft Teams meeting transcripts (already delivered as text by MS Graph).
9. "Casual conversation" capture (hallway chats, phone calls, non-Teams meetings) — deferred to a future phase
10. Multi-tenancy / SaaS architecture (aspirational for a possible future commercial phase)
11. Power BI or third-party analytics tooling (the Planner module owns PMO views)
12. Fully-autonomous Agent (MVP uses tiered HITL; see Section 7.2)
13. Formal SLA or uptime guarantees (best-effort operation for 400 users)
14. Success KPI definition with numeric targets (deferred to post-BRD measurement planning)
15. Detailed cost / budget breakdown (the ask is time and headcount only)
16. Inbound email processing and action extraction from emails — no `actions@` mailbox, no Agent parsing of email content
17. Commercialisation / multi-customer deployment

---

## 5. Solution Overview

The Action Intelligence Platform MVP is a **single web application**, internally organised as a monorepo. Architecturally the monorepo separates **reusable base infrastructure (Core)** from **user-facing modules (Planner, Agent, Mail)**. The three user-facing modules are built in **parallel** by three sub-teams and ship together.

### 5.1 Core (Shared Base Layer)

Core is **not a user-facing module**. It is the reusable foundation layer on which Planner, Agent, and Mail are built. Core provides:

- Authentication integration with Microsoft Entra ID (Azure AD) via SSO
- Database access abstractions for PostgreSQL
- Event bus / inter-module communication
- Shared UI kit used by the Planner module (and any future module)
- MS Graph client abstraction (used by the Planner module for Microsoft Planner sync and directory reads, and by the Agent module for Teams transcripts)
- Logging, audit, and observability utilities

Core is designed to be **reusable by future applications** in SETA's monorepo — it is not specific to the Action Intelligence Platform. The MVP delivers Core as a by-product of building the three user-facing modules; no dedicated Core team is required.

### 5.2 Planner Module

The primary system of record for action items. Owns the action database and exposes a **desktop web UI** to all authenticated users. Provides:

- Action CRUD, including mandatory-field validation, lifecycle management, and evidence attachment
- Role-scoped views — including PMO/Manager oversight dashboards (portfolio, by owner, by project, overdue, completed)
- Bidirectional synchronisation with **Microsoft Planner** (the Microsoft 365 product)
- The **Agent review queue UI** — where Agent-proposed actions, modifications, escalations, and external writes are reviewed and approved/rejected by designated reviewers
- Triggers transactional notifications, which are delivered by the Mail module

> **Naming note:** Throughout this BRD, "**Planner module**" refers to the internal module being built. "**Microsoft Planner**" refers to the Microsoft 365 product it integrates with. These are two different things and the distinction is preserved consistently throughout.

### 5.3 Agent Module

The AI layer that operates on Microsoft Teams meeting transcripts. The Agent does **not** process audio directly — it consumes the text transcripts that Microsoft Teams already generates and MS Graph exposes. No voice recording, no transcription service (Whisper), no audio storage is required.

The Agent operates on a **tiered human-in-the-loop model**:

- **Autonomous (low-risk)** — The Agent may directly: send reminder emails to the **owner of an action** about **their own** action (due-soon, 3-day warning, 1-day warning, overdue); attach transcript extracts to existing actions as read-only context; update its own confidence scores and internal metadata.
- **Human-in-the-loop (high-risk)** — The Agent produces _drafts_ for: **creating new action items** from Teams transcripts; **modifying existing action items** (reassigning owner, changing deadline, changing status); **escalation emails** that cc the owner's Manager or PMO; **external system writes** (calendar entries, external trackers). Drafts enter a review queue. They take effect only when approved by the designated reviewer (see FR-A-06).

### 5.4 Mail Module

An **outbound-only** email gateway used by both the Planner module and the Agent module. Provides:

- A send API that the Planner module calls to emit transactional notifications
- A send API that the Agent module calls to emit (a) autonomous reminder emails and (b) approved HITL emails
- SETA-branded email templates for each event type
- A complete log of every email sent

The Mail module does **not** receive or parse inbound email in MVP. No dedicated mailbox is provisioned.

### 5.5 System Diagram (Logical)

```
   ┌─────────────────────────────────────────────────────────────┐
   │                     Monorepo (AWS)                          │
   │                                                             │
   │  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐    │
   │  │    Planner    │◄─┤     Agent     │  │     Mail      │    │
   │  │    module     │  │    module     │  │    module     │    │
   │  │               │──┤               │─►│ (outbound     │    │
   │  │ • Action CRUD │  │ • Teams trans.│  │   only)       │    │
   │  │ • PMO UI      │  │ • Extraction  │  │ • Send API    │    │
   │  │ • RBAC        │  │ • Auto remind │─►│ • Templates   │    │
   │  │ • Review      │──┤ • Draft props │  │ • Audit log   │    │
   │  │   queue UI    │  │ • Audit       │  │               │    │
   │  │ • MS Planner  │  │               │  │               │    │
   │  │   sync        │  │               │  │               │    │
   │  └───────┬───────┘  └───────┬───────┘  └───────┬───────┘    │
   │          │                  │                  │            │
   │  ┌───────┴──────────────────┴──────────────────┴───────┐    │
   │  │             Core  (shared base layer)               │    │
   │  │  Auth · DB access · Event bus · UI kit · MS Graph   │    │
   │  │  client · Logging & audit                           │    │
   │  └──────────────────────────┬──────────────────────────┘    │
   │                             │                               │
   │         ┌───────────────────┴─────────────────────┐         │
   │         │   PostgreSQL (actions, review queue,    │         │
   │         │                audit, roles)            │         │
   │         │   S3 (evidence files)                   │         │
   │         └─────────────────────────────────────────┘         │
   └───────────────────────────┬─────────────────────────────────┘
                               │
             ┌─────────────────┼─────────────────┐
             │                 │                 │
        ┌────▼─────┐      ┌────▼─────┐      ┌────▼─────┐
        │ MS Graph │      │  OpenAI  │      │ AWS SES  │
        │ (Planner,│      │   LLM    │      │ (outbound│
        │  Teams   │      │          │      │  email)  │
        │  trans., │      │          │      │          │
        │  Entra   │      │          │      │          │
        │   ID)    │      │          │      │          │
        └──────────┘      └──────────┘      └──────────┘
```

---

## 6. User Roles & Permissions

### 6.1 Role Model

The MVP operates with a **three-role RBAC model**. Role assignment is managed by Admin inside the platform.

| Role        | Typical Users                               | Permissions                                                                                                                                                                                        |
| ----------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Admin**   | PMO, IT                                     | Read/write any action. Configure system, manage role assignments. Override any ownership. Operate Agent kill switch and autonomy controls. Reviewer for all Agent-proposed external-system writes. |
| **Manager** | Line managers, team leads, project managers | Read/write actions owned by members of their team. Read analytics scoped to their team. Reviewer for Agent-proposed modifications to their team members' actions.                                  |
| **Member**  | All other staff                             | Read/write their own actions (where they are designated owner). Read actions on projects they participate in. Reviewer for Agent-proposed modifications to their own actions.                      |

Every action item has a single designated **owner** (a Member, Manager, or Admin). Edit rights default to the owner; Admins may override; a Manager may edit actions owned by their team members.

### 6.2 User Directory

The platform does **not** maintain its own user list. The authoritative user directory is **Microsoft 365 / Microsoft Entra ID**. All users are provisioned, updated, and deprovisioned in Entra ID; the monorepo reads user identity and attributes from there via SSO and MS Graph as needed.

Assignment of roles (Admin / Manager / Member) is managed inside the platform by Admin users. Role assignment is orthogonal to Entra ID group membership in MVP — Admin operates it manually. Linking roles to Entra ID groups is a possible post-MVP enhancement.

---

## 7. Functional Requirements

### 7.1 Planner Module

| ID          | Requirement                                                                                                                                                                                                                                                                                                                                                               |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **FR-P-01** | The system shall allow any authenticated user to create an action item via the Planner module web UI.                                                                                                                                                                                                                                                                     |
| **FR-P-02** | An action item shall require the following **mandatory** fields to be saved: _title_, _owner_, _deadline_, _status_, _priority_, _project tag_, _source type_.                                                                                                                                                                                                            |
| **FR-P-03** | An action item shall support the following **optional** attributes: description, impact level, evidence (text/link/file), source reference (e.g. Teams transcript link), created-by, created-at, updated-at.                                                                                                                                                              |
| **FR-P-04** | An action item shall move through the lifecycle states: **Open / In Progress / Done / Blocked**.                                                                                                                                                                                                                                                                          |
| **FR-P-05** | State transitions shall be permitted for the owner, the owner's Manager, and any Admin. The Agent may _propose_ state transitions via the review queue (FR-A-05).                                                                                                                                                                                                         |
| **FR-P-06** | To mark an action as **Done**, evidence shall be attached per the following tier policy: **Tier 1 (text)** — mandatory for all actions (completion note). **Tier 2 (link)** — mandatory for actions with impact level ≥ 3. **Tier 3 (file)** — mandatory for actions with impact level ≥ 4.                                                                               |
| **FR-P-07** | The system shall provide PMO/Manager views including: portfolio overview, actions by project, actions by owner, overdue actions, recently completed actions. Views are scoped to the viewer's role.                                                                                                                                                                       |
| **FR-P-08** | The system shall bidirectionally synchronise action items with Microsoft Planner via MS Graph. Actions created in the Planner module appear as Microsoft Planner tasks for the owner; updates made in Microsoft Planner propagate back to the module. Conflict resolution policy: **most recent update wins**, with the loser logged for Admin review.                    |
| **FR-P-09** | The system shall issue transactional notifications on: _action assigned_, _status changed_, _deadline approaching (3 days)_, _deadline approaching (1 day)_, _overdue_, _completed_. The Planner module **triggers** these notifications; the **Mail module is the sole sender** of the email form, and the Planner module itself renders in-app notifications in the UI. |
| **FR-P-10** | The system shall present in-app notifications in the Planner module UI to the authenticated user, persisting unread notifications until acknowledged.                                                                                                                                                                                                                     |
| **FR-P-11** | The system shall record a complete audit log of all create/update/state-change operations with user, timestamp, and field-level diff. Agent-originated changes are clearly distinguished from human-originated changes.                                                                                                                                                   |
| **FR-P-12** | The system shall support search and filter of actions by: owner, project, status, deadline range, priority, impact level, source type, and free-text search of title/description.                                                                                                                                                                                         |
| **FR-P-13** | The system shall read user identity and directory attributes from Microsoft Entra ID / MS365 via MS Graph. The module shall not store or manage its own user list; role assignment is the only identity-related data it owns.                                                                                                                                             |
| **FR-P-14** | The Planner module shall host the **Agent review queue UI** — where Agent-produced drafts (new actions, proposed modifications, proposed escalations, proposed external writes) are presented to the designated reviewer with accept / edit-and-accept / reject controls.                                                                                                 |

### 7.2 Agent Module

| ID          | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **FR-A-01** | The Agent's sole voice input in MVP is **Microsoft Teams meeting transcripts**, accessed via MS Graph. Teams transcripts are consumed as text; no audio handling, transcription service, or audio storage is required.                                                                                                                                                                                                                                                                                                                                               |
| **FR-A-02** | The Agent shall extract candidate action items from Teams meeting transcripts using the OpenAI LLM. For each candidate it shall produce: _title_, _likely owner_, _deadline hint_, _priority inference_, _context reference (link to source transcript section)_, _confidence score_.                                                                                                                                                                                                                                                                                |
| **FR-A-03** | **Autonomous Agent activity (low-risk).** The Agent may perform the following _without prior human approval_: (a) send a reminder email to the owner of an action about **their own** action — specifically: 3-day warning, 1-day warning, or overdue notice. No cc, no external recipients. (b) attach a Teams transcript excerpt to an existing action as read-only context. (c) update the Agent's internal metadata (confidence scores, last-processed markers). Every autonomous action is recorded in the audit log.                                           |
| **FR-A-04** | **Human-in-the-loop Agent activity (high-risk).** The Agent must route the following to the review queue and may act only after reviewer approval: (a) **creating a new action item** from a Teams transcript; (b) **modifying an existing action item** (reassigning owner, changing deadline, changing status); (c) **escalation emails** that cc any party beyond the action owner (e.g. cc to Manager, PMO); (d) **writes to external systems** (calendar entries, tickets in external trackers). The Agent may never execute these operations without approval. |
| **FR-A-05** | **Proposals** (items routed through FR-A-04) shall be produced as _drafts_ with: the proposed operation, reasoning, source reference, and confidence score. The reviewer may **accept**, **edit-and-accept**, or **reject**. Edit-and-accept is persisted as the approved form. Rejected proposals are logged but not acted upon.                                                                                                                                                                                                                                    |
| **FR-A-06** | **Reviewer routing** shall be: (a) new actions extracted from a Teams transcript → the meeting organiser by default, with fallback to Admin if the organiser is out-of-scope; (b) modifications to an existing action → the current owner, with fallback to the owner's Manager, with final fallback to Admin; (c) escalation emails that cc Manager or PMO → the action owner first; if the owner does not respond within expiry (FR-A-08), then Admin; (d) external system writes → Admin only.                                                                    |
| **FR-A-07** | The review queue shall be visible to designated reviewers via the Planner module UI (FR-P-14). Reviewers receive an in-app notification (and optionally an email via Mail) when a new item requires their attention.                                                                                                                                                                                                                                                                                                                                                 |
| **FR-A-08** | Proposals in the review queue shall **expire** if not acted upon within a configurable window (default 7 days). Expired proposals are auto-cancelled and Admin is notified of the backlog.                                                                                                                                                                                                                                                                                                                                                                           |
| **FR-A-09** | The Agent shall enforce **rate limits** on autonomous outbound actions (reminder emails per user per hour, per-action-item modifications per day). Limits are configurable by Admin.                                                                                                                                                                                                                                                                                                                                                                                 |
| **FR-A-10** | The system shall implement **anomaly-detection auto-pause** — the Agent is paused automatically when anomalous behaviour is detected (e.g. sudden spike in extraction volume, repeated external-call failures, excessive proposal-generation for a single action item). A paused Agent shall resume only on explicit Admin intervention.                                                                                                                                                                                                                             |
| **FR-A-11** | The Agent shall maintain a **complete audit log** of all operations — autonomous emails sent, proposals produced, proposals accepted/rejected/expired, external calls attempted — with sufficient detail (input reference, output produced, confidence, user(s) affected, timestamp) to support post-hoc review.                                                                                                                                                                                                                                                     |
| **FR-A-12** | Admins shall be able to **globally pause** Agent activity (kill switch) and **selectively disable** individual Agent capabilities (transcript extraction, autonomous reminders, modifications, escalations, external writes) via the Admin panel in the Planner module UI.                                                                                                                                                                                                                                                                                           |

### 7.3 Mail Module (Outbound Only)

| ID          | Requirement                                                                                                                                                                                                                                                                                                              |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **FR-M-01** | The Mail module shall expose a **send API** used by the Planner module (for transactional notifications) and the Agent module (for autonomous reminder emails and approved HITL emails). The Mail module is the **sole sender** of outbound email; neither the Planner module nor the Agent module sends email directly. |
| **FR-M-02** | Outbound emails shall use SETA-branded templates keyed to event type: action assigned, reminder (3-day), reminder (1-day), overdue, completion confirmation, Agent reminder, Agent-approved escalation, review-queue notification.                                                                                       |
| **FR-M-03** | The Mail module shall maintain a complete log of every email sent, including timestamp, sender (on-behalf-of user where relevant), recipient(s), subject, template used, originating module (Planner / Agent), whether the email was autonomous or HITL-approved, and a reference to the related action item.            |
| **FR-M-04** | The Mail module shall use AWS SES (or equivalent) as its outbound transport.                                                                                                                                                                                                                                             |
| **FR-M-05** | The Mail module is **outbound-only in MVP**. It does not receive, parse, or process inbound email. No `actions@` mailbox is provisioned.                                                                                                                                                                                 |

---

## 8. Non-Functional Requirements

| ID                                           | Requirement                                                                                                                                                                                    |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **NFR-01 — Hosting**                         | The platform shall run on AWS. Compute and storage are AWS-native. Region choice is an engineering decision.                                                                                   |
| **NFR-02 — Auth & Directory**                | Authentication is via **Microsoft Entra ID (Azure AD) SSO**. User identity and directory attributes are read from Entra ID / MS365 via MS Graph. Local accounts are not supported in MVP.      |
| **NFR-03 — Language**                        | UI, notifications, and LLM outputs are in **English only** in MVP. Teams transcripts are consumed in whatever language Microsoft Teams produces them; the LLM prompt pipeline targets English. |
| **NFR-04 — Client**                          | The MVP is a **desktop web application**. Mobile applications and dedicated mobile-web optimisation are out of scope.                                                                          |
| **NFR-05 — Scale**                           | The platform shall support approximately **400 users** under reasonable concurrent load. No formal SLA is committed for MVP.                                                                   |
| **NFR-06 — Audit**                           | All action CRUD, all Agent operations (autonomous and HITL), all outbound email, and all authentication events shall be logged.                                                                |
| **NFR-07 — Retention**                       | Evidence files and action data retained **indefinitely**. Audit logs retained indefinitely. _No audio files are stored in MVP (no direct audio capture)._                                      |
| **NFR-08 — Storage**                         | Evidence attachments stored in AWS S3. Action data, review queue state, audit logs, and role assignments stored in a PostgreSQL database on AWS.                                               |
| **NFR-09 — Security**                        | Data at rest and in transit encrypted (AWS KMS at rest; TLS in transit). External API calls (MS Graph, OpenAI, SES) over TLS. Service-role-based access to S3 and PostgreSQL.                  |
| **NFR-10 — Accessibility & Browser Support** | Inherits SETA's standard internal web accessibility and browser support baseline. No MVP-specific commitment.                                                                                  |
| **NFR-11 — Reuse**                           | The Core base layer shall be designed for reuse by future applications in the monorepo. Its API surface shall not be coupled to the Action Intelligence Platform specifically.                 |

---

## 9. Integration Requirements

| ID                                        | Requirement                                                                                                                        |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **INT-01 — MS Graph (Planner)**           | Used by the Planner module for bidirectional Microsoft Planner task synchronisation (create / update / complete).                  |
| **INT-02 — MS Graph (Teams transcripts)** | Used by the Agent module for read access to Microsoft Teams meeting transcripts. **This is the Agent's sole voice-content input.** |
| **INT-03 — MS Graph (Directory)**         | Used by the Planner module (via Core) to read user identity and directory attributes from Microsoft Entra ID / MS365.              |
| **INT-04 — OpenAI API (direct)**          | Used by the Agent module for LLM-powered action extraction and draft-content generation.                                           |
| **INT-05 — AWS SES**                      | Used by the Mail module for outbound email delivery. No inbound configuration.                                                     |
| **INT-06 — Entra ID (OIDC/OAuth)**        | Used for user SSO authentication via the Core base layer.                                                                          |

_(v1.2 note: OpenAI Whisper, previously listed, is no longer used. Teams transcripts are already text.)_

---

## 10. Data & Privacy Considerations

| ID                                     | Requirement                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **DP-01 — External data transit**      | Action content and excerpts of Teams meeting transcripts will be transmitted to the OpenAI API as part of normal Agent operation. This means organisational data leaves the AWS boundary. Committee approval of this BRD constitutes acknowledgement that this data transit is accepted under SETA's current vendor policy. _No voice audio is transmitted anywhere — Teams transcripts are already text._ |
| **DP-02 — Meeting transcript consent** | Microsoft Teams already handles recording and transcription consent natively (attendees see notification when transcription is active). No additional consent mechanism is required in this platform for Teams-sourced content.                                                                                                                                                                            |
| **DP-03 — Right to delete**            | Admins may delete any action item and its associated transcript excerpts and evidence on request. Deletion propagates to S3 and related logs within a reasonable operational window.                                                                                                                                                                                                                       |
| **DP-04 — PII handling**               | Email subject lines generated by the system shall not include sensitive PII beyond the action owner's name. Body content is governed by SETA's standard email-handling policy.                                                                                                                                                                                                                             |
| **DP-05 — Audit log retention**        | Audit logs (action changes, Agent operations, outbound email, authentication events) are retained indefinitely for traceability.                                                                                                                                                                                                                                                                           |

---

## 11. Dependencies

| ID         | Dependency                                                                                                                                                                                                                    |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **DEP-01** | SETA has an active Microsoft Entra ID (Azure AD) tenant and all in-scope users are provisioned in it. This is the authoritative user directory.                                                                               |
| **DEP-02** | The M365 tenant administrator will grant the MS Graph application permissions required by the monorepo (Microsoft Planner read/write, Teams transcript read, directory read) on a timeline compatible with the 1-month build. |
| **DEP-03** | Microsoft Planner licences are in place for all in-scope users.                                                                                                                                                               |
| **DEP-04** | Microsoft Teams transcription is **enabled and in active use** within SETA meetings — the Agent's primary input. If transcripts are not being generated, the Agent has no voice content to process.                           |
| **DEP-05** | OpenAI API usage has been reviewed and approved under SETA's vendor / data policy.                                                                                                                                            |
| **DEP-06** | An AWS account exists with sufficient capacity (compute, S3, PostgreSQL, SES) for the expected MVP load.                                                                                                                      |
| **DEP-07** | Internal engineering capacity is sufficient to run three parallel sub-teams (Planner, Agent, Mail) for one calendar month, with Core infrastructure emerging as a by-product of the build.                                    |
| **DEP-08** | PMO and IT jointly sponsor rollout, including the pilot team and subsequent phased waves.                                                                                                                                     |

---

## 12. Assumptions

| ID        | Assumption                                                                                                                                                                                                                                                            |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **AS-01** | English-only UI and LLM processing is sufficient for MVP users. Users whose primary language is not English are comfortable operating in English for this platform.                                                                                                   |
| **AS-02** | Microsoft Teams is the dominant meeting channel at SETA and produces transcripts of sufficient quality for extraction. Non-Teams meetings (phone calls, hallway conversations, external meetings without Teams) are accepted as out-of-scope for the MVP voice input. |
| **AS-03** | Users will honour the Tier 1/2/3 evidence policy rather than finding workarounds. Enforcement is at the UI level; real-world compliance is a behavioural variable and is tracked in the audit log.                                                                    |
| **AS-04** | The committee does not require pre-build baseline pain data. The commitment is to establish baseline from Week 1 of pilot operation.                                                                                                                                  |
| **AS-05** | Planner, Agent, and Mail sub-teams can agree on shared API contracts, Core library boundaries, and schemas in Week 1 of the build so that subsequent weeks are independently parallelisable.                                                                          |
| **AS-06** | Reviewers (meeting organisers, action owners, Managers, Admins) will engage with the review queue promptly. The default 7-day proposal expiry (FR-A-08) assumes reasonable turnaround.                                                                                |
| **AS-07** | The Microsoft Entra ID directory is sufficiently accurate and up-to-date to serve as the authoritative user list for the platform. No reconciliation layer is required in MVP.                                                                                        |

---

## 13. Risks & Mitigations

| ID       | Risk                                                                                                                                                                                                                                             | Impact     | Likelihood | Mitigation                                                                                                                                                                                                              |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **R-01** | **Parallel 3-module build in 1 month is ambitious.** Scope is committed in full; a slip in any one module produces a build delay. The phased rollout (Section 14) partially absorbs a slip.                                                      | Medium     | Medium     | Shared API contracts, Core library shape, and schemas agreed in Week 1. Daily cross-module sync during Weeks 2–4. Pilot start date has some buffer.                                                                     |
| **R-02** | **Agent proposal quality.** If the LLM produces low-quality drafts (wrong owner, wrong deadline, hallucinated actions), reviewers experience review fatigue and the queue becomes a chore rather than a useful layer. Trust in the Agent erodes. | Medium     | Medium     | Pilot data informs prompt tuning before wave 1. Reviewers may reject in bulk. Rejection rates tracked as a quality signal in the audit log. Per-capability disable if a specific proposal type is unreliable (FR-A-12). |
| **R-03** | **Cross-cloud data egress.** Action content and transcript excerpts leave the AWS environment when calling OpenAI APIs.                                                                                                                          | Low-Medium | Certain    | Documented in DP-01. Traffic encrypted in transit. Vendor-policy sign-off captured as a dependency (DEP-05). No voice audio transmitted (major reduction vs earlier BRD drafts).                                        |
| **R-04** | **MS Graph dependency.** The platform is functionally dependent on M365 tenant administrators granting MS Graph application permissions on time, and on Teams transcription being enabled and active across meetings.                            | Medium     | Medium     | Full permission manifest drafted Week 1 and submitted to tenant admin the same week. Teams transcription policy reviewed with IT and PMO before build. Build continues against mocks if permissions are delayed.        |
| **R-05** | **Review queue bottleneck.** If Agent proposes more items than reviewers can process, the queue grows, proposals expire, and the Agent's value is degraded.                                                                                      | Medium     | Medium     | Rate limits on proposal generation (FR-A-09). Expiry policy (FR-A-08). Pilot measures reviewer throughput before scaling to full org. Admin-level dashboard showing queue depth per reviewer.                           |
| **R-06** | **No pre-launch measurement baseline.** Without pain data from before go-live, post-launch ROI is demonstrated only against internal metrics collected from Week 1 of pilot.                                                                     | Medium     | Certain    | Live metrics collection (action volume, completion rate, overdue rate, source mix, Agent proposal acceptance rate) from Week 1 of pilot. Pilot produces the baseline against which phased-wave rollout is measured.     |
| **R-07** | **Evidence Tier 3 compliance behaviour.** If users do not attach files for high-impact actions, either Done rates drop (strict enforcement) or Done status becomes unreliable (loose enforcement).                                               | Medium     | Medium     | Enforcement is strict at the UI level for impact ≥ 4. Pilot surfaces non-compliance patterns before full rollout.                                                                                                       |
| **R-08** | **Entra ID directory drift.** The platform reads users from Entra ID without a reconciliation layer. If the directory is inaccurate, those errors surface directly in the platform.                                                              | Low-Medium | Low        | Admin-level audit of role assignments during pilot. Escalation path to IT for directory issues identified in pilot.                                                                                                     |

---

## 14. Delivery Approach

### 14.1 Build Phase (Weeks 1–4)

**Timeline.** Target delivery of the build is **one calendar month** from committee approval. This is a target, not a contractually hard date.

**Team structure.** Three parallel sub-teams, one per user-facing module (Planner, Agent, Mail). Core infrastructure emerges from what all three teams need in common; a shared technical lead or architect owns Core boundaries and cross-module contracts.

**Weekly shape.**

- **Week 1** — API contracts, Core library boundaries, shared schemas, AWS environment standup, MS Graph permission request submitted, OpenAI / SES provisioned.
- **Weeks 2–3** — Parallel feature development inside each module. Core components land as they are needed. Review queue UI in Planner module stood up early so Agent can test against it.
- **Week 4** — Cross-module integration, Admin tooling finalisation, audit-review tooling, pilot-team onboarding materials prepared.

### 14.2 Pilot Phase (Weeks 5–8)

**Who.** A single pilot team — either the PMO itself or a single project team — nominated by Admin and the committee. Approximately 10–30 users.

**Duration.** Four weeks.

**What's measured.** Action volume, completion rate, Agent proposal volume and acceptance rate, reviewer turnaround time, queue depth, user-reported issues, Tier 3 evidence compliance rate.

**Gates to wave 1.** At the end of week 8, the committee reviews pilot data and approves (or delays) the phased-wave rollout. No numeric KPI gate is pre-committed; the judgement is a qualitative "is this working well enough to expand?"

### 14.3 Phased-Wave Rollout (Week 9 onwards)

**Wave shape.** Departmental waves of ~2 weeks each. Each wave activates the platform for the next department, carries forward pilot improvements, and captures any wave-specific feedback for the next wave.

**Target.** Full organisational coverage approximately **10 weeks after build completion** (i.e. approximately week 14 from committee approval).

**Adjustability.** If a wave surfaces an issue that requires remediation, subsequent waves are paused until the fix is deployed. The pace is set by readiness, not calendar.

---

## 15. Governance & Rollout

**Admin operational rhythm.** During pilot (weeks 5–8), Admin users (PMO + IT) review the Agent audit log **daily**, inspect the review queue health, and triage user feedback. During wave rollout, Admin rhythm shifts to a twice-weekly cadence unless an incident requires more.

**Change control.** Changes to Agent behaviour (rate limits, enabled capabilities, external integrations) and to role assignments are made by Admin through the Admin panel in the Planner module UI. These changes do not require committee re-approval; they are logged and visible to the Admin group.

**Pilot feedback capture.** During pilot, a feedback channel (in-app form in the Planner module, plus a shared Teams channel) collects user-reported issues, suggestions, and friction points. Feedback is triaged weekly by Admin.

**Agent kill-switch and per-capability disable.** Operable at any time by any Admin throughout pilot and phased rollout (FR-A-12).

**Communications.** Each wave is preceded by a departmental announcement explaining: (a) what the platform does; (b) how to attach evidence; (c) how the Agent review queue works and what's expected of reviewers; (d) how to report a problem or contest an Agent-originated proposal.

**User support.** PMO and IT jointly field first-line user support. Technical escalations go to the engineering team for the full rollout period (pilot + waves), reverting to standard IT support thereafter.

**Post-rollout review.** After full coverage is reached, a committee review is convened to assess: baseline metrics, Agent proposal quality and acceptance, audit findings, and priorities for the next phase (which may include: mobile client, Vietnamese language, Data Platform module, inbound email parsing, broader Agent autonomy where pilot data supports it, non-Teams voice sources).

---

## 16. Intentionally Excluded from This BRD

The following are _not_ included in this BRD, and are listed here so the committee understands exactly what their approval does and does not cover:

- **Success KPIs with numeric targets.** To be established from Week 1 of pilot operation using real data and proposed in a follow-up document.
- **Cost / budget breakdown.** The approval requested is for **time and headcount only**. Infrastructure spend (AWS, OpenAI API, M365) is assumed to be absorbed under existing organisational accounts.
- **Fully autonomous Agent posture.** Agent is tiered-HITL; see FR-A-03 and FR-A-04. Greater autonomy may be considered post-pilot if data supports it.
- **Data Platform module.** The analytics/warehouse module from the original proposal is deferred to a future phase.
- **Inbound email processing.** No `actions@` mailbox, no email parsing. Deferred to a future phase.
- **Direct audio / voice capture.** The Agent reads only Teams transcripts. Non-Teams voice capture (desktop mic, file upload, phone recordings) is deferred.
- **Commercialisation roadmap.** The original proposal's Path A / B / C discussion is preserved as strategic context, but commercialisation is not part of this MVP.

---

## 17. Next Steps — What Approval Enables

On committee approval, the following begin immediately:

1. Engineering lead designates three sub-team leads (Planner, Agent, Mail) and appoints an architect to own Core boundaries. A Week-1 contracts and schemas session is convened.
2. MS Graph application registration and permission request submitted to the M365 tenant administrator (Microsoft Planner, Teams transcripts, directory read).
3. AWS account provisioning confirmed; PostgreSQL, S3, and SES baselines stood up.
4. OpenAI API access confirmed and credentialled.
5. Admin (PMO + IT) joint ownership formalised; initial Admin users identified and trained on the review queue, kill switch, and per-capability disable controls.
6. **Pilot team nominated** by Admin + committee during weeks 1–3 of build.
7. Pilot onboarding materials drafted during Week 4 for committee review.
8. Committee review slot pre-booked for the end of week 8 (pilot → wave-1 gate) and for full-coverage review.

---

## 18. Open Questions for the Committee

The committee may wish to explicitly direct on the following items rather than leaving them to the defaults assumed in this BRD:

| ID       | Question                                                                                                                                                                               |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Q-01** | Is cross-cloud data egress to OpenAI acceptable under SETA's current vendor policy, or is in-region / self-hosted LLM processing preferred at the cost of an extended delivery window? |
| **Q-02** | Is English-only MVP acceptable, or should Vietnamese support be moved into MVP scope at the cost of an extended delivery window?                                                       |
| **Q-03** | Which team should pilot? Committee preference for PMO (familiar with the governance problem) vs. a single project team (closer to the day-to-day pain).                                |

---

## Appendix A — Glossary

| Term                          | Meaning                                                                                                                                                                          |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Action item**               | A specific, assignable, time-bound task generated from a Teams meeting or manual entry.                                                                                          |
| **Admin / Manager / Member**  | The three RBAC roles governing permissions in MVP.                                                                                                                               |
| **Agent module**              | The AI layer that extracts candidate action items from Microsoft Teams transcripts and generates proposals (HITL) or autonomous reminders. One of the three user-facing modules. |
| **Autonomous Agent activity** | Agent operations that do not require human approval — specifically reminder emails to an action's owner about their own action, and read-only context additions. See FR-A-03.    |
| **Core**                      | The shared base layer of the monorepo. Reusable infrastructure (auth, DB access, event bus, UI kit, MS Graph client, logging). **Not a user-facing module.**                     |
| **Entra ID**                  | Microsoft Entra ID (formerly Azure AD). The authoritative directory for user identity.                                                                                           |
| **Evidence Tier 1 / 2 / 3**   | Mandatory completion evidence scaled by action impact level — text (all), link (impact ≥ 3), file (impact ≥ 4).                                                                  |
| **HITL (Human-in-the-loop)**  | A mode where the Agent produces drafts that a human reviews before they take effect.                                                                                             |
| **Mail module**               | An outbound-only email gateway used by the Planner module (transactional) and Agent module (reminders and approved HITL emails). Does not process inbound email in MVP.          |
| **Microsoft Planner**         | The Microsoft 365 product. The platform bidirectionally syncs action items with Microsoft Planner via MS Graph. _Not to be confused with the **Planner module** below._          |
| **Monorepo**                  | A single code repository containing Core and all three user-facing modules.                                                                                                      |
| **MS Graph**                  | Microsoft's unified API surface for Microsoft 365 data (Planner, Teams, directory, mail, etc.).                                                                                  |
| **MVP**                       | Minimum Viable Product — the 1-month build scope defined in this BRD, followed by a 4-week pilot and phased-wave rollout.                                                        |
| **Planner module**            | The internal action-management module. Provides the UI, CRUD, PMO views, Microsoft Planner sync, and the Agent review queue UI. _Not Microsoft Planner — see above._             |
| **PMO**                       | Project Management Office — the primary operational user of the Admin and Manager views.                                                                                         |
| **Review queue**              | The set of Agent-produced proposals awaiting human approval. Lives in PostgreSQL and is surfaced through the Planner module UI.                                                  |
| **Teams transcript**          | The text transcript that Microsoft Teams automatically generates for a meeting when transcription is enabled. The Agent's sole voice input in MVP.                               |

---

## Appendix B — Relationship to Original Proposal

This BRD is derived from _Action Intelligence Platform Proposal v2.0_ (10 April 2026). The proposal remains useful as strategic context. Where the proposal and this BRD diverge, **this BRD is authoritative**. The material differences are:

| Area                     | Original Proposal v2.0                                                    | This BRD (v1.2)                                                                                                                      |
| ------------------------ | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Phasing                  | Three phases: MS-native → Custom DB → AI Platform                         | One MVP phase; MS-native phase collapsed                                                                                             |
| MS 365 surface           | Lists + Planner + Loop + Power Automate                                   | Microsoft Planner sync + Teams transcript read + Entra ID directory only                                                             |
| Modules                  | Core + Data Platform + Agent                                              | **Core (shared base)** + **Planner module** + **Agent module** + **Mail module**                                                     |
| Voice input              | Mobile app, desktop mic, file upload, Teams meetings (all paths)          | **Microsoft Teams transcripts only** — no audio handling, no Whisper, no audio storage                                               |
| Email inbox (`actions@`) | Dedicated mailbox; Power Automate parses inbound emails into action items | No inbound mailbox and no email parsing in MVP                                                                                       |
| Cloud                    | Azure (SEA)                                                               | AWS                                                                                                                                  |
| Mobile                   | Mobile PWA with casual-conversation capture                               | Desktop-only; mobile deferred                                                                                                        |
| Language                 | Vietnamese + English from MVP                                             | English only in MVP; Vietnamese deferred                                                                                             |
| Agent autonomy           | Human-in-the-loop pattern                                                 | **Tiered HITL** — autonomous for reminder emails to own owner; HITL for action creation, modifications, escalations, external writes |
| Rollout                  | Pilot team → phased → full                                                | **Pilot (4 weeks) → phased waves by department (2 weeks each) → full (~10 weeks post-build)**                                        |
| Commercialisation        | Explicit Path A / B / C roadmap                                           | Preserved as strategic context only; out of MVP scope                                                                                |

---

_End of document._
