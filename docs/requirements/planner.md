**PROPOSAL**

**Action Intelligence Platform**

_Centralised Meeting & Voice Action Management with AI-Powered Execution and Commercialisation Roadmap_

|                   |                                 |
| ----------------- | ------------------------------- |
| **Prepared for:** | SETA / BlueOC Leadership Team   |
| **Prepared by:**  | Technology & AI Strategy Office |
| **Date:**         | April 10, 2026                  |
| **Version:**      | 2.0 – Revised Proposal          |

# 1. Executive Summary

SETA operates with approximately 400 staff across multiple concurrent projects. Despite a high volume of daily meetings and frequent informal conversations, there is currently no centralised system to capture, assign, track, or follow up on action items. This gap directly impacts project delivery quality, accountability, and overall company performance.

This proposal outlines a three-phase plan to address this gap — progressing from an immediately deployable Microsoft-native setup to a fully AI-powered Action Intelligence Platform. Version 2.0 incorporates three additional requirements: (1) email-based notifications via Microsoft Outlook, (2) voice recording capture for casual conversations that occur outside of formal Teams meetings, and (3) a future commercialisation roadmap that transforms this internal tool into a marketable product.

**Strategic vision: Transform all meeting outputs — whether from formal Teams meetings, emails, or casual voice recordings — into a governed, searchable, AI-analysable execution layer that serves as the data backbone for PMO governance, performance evaluation, and AI-driven management. Then commercialise it.**

# 2. Requirements Analysis

The following requirements have been identified and updated to reflect v2.0 additions:

| **Requirement**                    | **Description**                                                                                                                                                                      |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| REQ-01 – Centralised Store         | A single repository to capture, store, and retrieve all action items across SETA.                                                                                                    |
| REQ-02 – Ownership & Deadlines     | Every action item must have a designated in-charge person and a specific deadline.                                                                                                   |
| REQ-03 – MS Teams Integration      | Action items must integrate with SETA's existing Microsoft Teams environment.                                                                                                        |
| REQ-04 – Email Notifications       | NEW: Notifications must also be delivered via Microsoft Outlook email — covering assignment alerts, deadline reminders, overdue escalations, and weekly digests.                     |
| REQ-05 – Performance Evaluation    | Completed and uncompleted actions should feed into employee performance review.                                                                                                      |
| REQ-06 – Internal Database         | Action data must reside in SETA's own database for custom search, filtering, and LLM-based analysis.                                                                                 |
| REQ-07 – Evidence-Based Completion | Completed action items must be supported by documented evidence (attachments, links, notes).                                                                                         |
| REQ-08 – Voice Recording Capture   | NEW: Support voice recordings for capturing action items from casual conversations that occur outside Teams meetings. AI transcription and extraction must be applied automatically. |
| REQ-09 – Search & Filter           | The system must support searching by project, owner, deadline, impact level, source type, and department.                                                                            |
| REQ-10 – Commercialisation-Ready   | NEW: The platform architecture should be designed with multi-tenancy and productisation in mind from the outset, enabling future commercialisation as a SaaS product.                |

# 3. Proposed Solution

We propose a phased approach delivering immediate value through existing Microsoft tools, then building toward a custom AI-powered execution system, and ultimately a commercialisable SaaS product.

## Phase 1 — Microsoft-Native Quick Win (Weeks 1–3)

Leverage the existing Microsoft 365 ecosystem to deliver a working action tracking and notification system within 2–3 weeks.

### 1.1 Central Action Tracker — Microsoft Lists

Use Microsoft Lists as the single source of truth for all action items. Each record should contain:

- Title, Description, Meeting/Voice Source link
- Owner (assigned person), Deadline, Priority (High/Medium/Low)
- Status — Open / In Progress / Done / Blocked
- Impact Level — Project / Company / Strategic
- Source Type — Teams Meeting / Email / Voice Recording / Manual
- Tags (project name, client, department), Evidence attachment

### 1.2 Execution Layer — Microsoft Planner

Each Teams channel should have a linked Planner board for day-to-day task execution. Planner provides individual assignment, deadline reminders, and syncs to Outlook and personal To Do lists.

### 1.3 Meeting Action Capture — Microsoft Loop

Adopt Microsoft Loop within every Teams meeting for a standardised 'Action Items' section. Every entry captures: Action, Owner, and Deadline. Loop components are live and collaborative.

### 1.4 Email Notifications — Microsoft Outlook & Power Automate

In addition to Teams notifications, Power Automate will trigger Outlook email notifications for the following events:

- **New assignment — email sent to the owner immediately upon task creation**
  - Subject: '[ACTION] New task assigned to you: {title}'
  - Body includes: task details, deadline, priority, and a direct link to the action record
- **Deadline reminder — automated email 3 days and 1 day before the due date**
  - Sent to the owner and cc'd to their direct manager
- **Overdue escalation — email triggered the day after a missed deadline**
  - Sent to the owner, manager, and the PMO inbox
- **Weekly digest — every Monday morning, a summary email to each staff member**
  - Lists all their open and overdue actions for the coming week
- **Completion acknowledgement — email to the meeting organiser or requester when an action is marked Done**

Why email in addition to Teams? Not all staff monitor Teams channels proactively. Email ensures accountability reaches every employee regardless of their Teams usage habits, and creates a permanent, searchable paper trail in Outlook.

### 1.5 Automation — Power Automate Summary

Power Automate flows will connect the entire Phase 1 stack:

- Extract actions from Teams messages, Loop components, and Forms
- Create items in Microsoft Lists and assign tasks in Planner
- Send Teams channel notifications to the owner
- Send Outlook email notifications (as described in 1.4 above)
- Parse inbound emails addressed to a dedicated action mailbox (e.g., actions@seta.com) and auto-create list items

Phase 1 delivers: Centralised action database | Teams + Email notifications | Owner accountability | Searchable history | Foundation for voice and AI integration

## Phase 2 — Custom Action Database + Voice Capture (Months 1–2)

Build a custom internal database and application, including a dedicated voice recording feature to capture action items from casual conversations that happen outside of formal Teams meetings.

### 2.1 Voice Recording — Capturing Casual Conversations

A significant volume of decisions and action items arise in informal settings: office hallway discussions, coffee chats, on-site client visits, and phone calls. These are currently lost entirely. The proposed voice capture feature addresses this gap through two input modes:

| **Mode**             | **How It Works**                                                                                                              | **Best For**                                                    |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Mobile App Recording | Staff press a record button in the mobile/web app during or after a casual conversation. The audio is uploaded and processed. | On-site meetings, client visits, phone calls, hallway decisions |
| Voice Memo Upload    | Upload existing voice memos from phone or recording device. Supported formats: MP3, M4A, WAV, OGG.                            | Retrospective capture of recordings already made                |

### 2.2 Voice Processing Pipeline

Once a voice recording is submitted, it passes through a four-stage automated pipeline:

| **Step** | **Stage**      | **Detail**                                                                                                                            |
| -------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 1        | Transcription  | Azure AI Speech (or OpenAI Whisper) converts audio to text. Supports Vietnamese and English, with speaker diarisation where possible. |
| 2        | AI Extraction  | LLM processes the transcript to identify action items, extract the task, likely owner, deadline hints, and context.                   |
| 3        | Human Review   | The submitter sees a draft list of extracted action items and can confirm, edit, add owners, and set precise deadlines before saving. |
| 4        | Storage & Sync | Confirmed actions are written to the internal database, assigned in Planner, and email + Teams notifications are sent to owners.      |

### 2.3 Recommended Tech Stack for Voice

- Speech-to-Text: Azure AI Speech Services (preferred, integrates with M365) or OpenAI Whisper (open-source, strong multilingual support)
- Action Extraction: GPT-4 / Claude API via a structured prompt pipeline
- Mobile interface: Progressive Web App (PWA) accessible on any smartphone browser with no app store installation required
- Storage: Azure Blob Storage for raw audio files with automatic deletion after processing (30-day retention policy recommended)

### 2.4 Custom Application Features (Full MVP)

The Phase 2 web application includes all features from v1.0, plus:

- **Voice Capture — record or upload audio, review AI-extracted draft actions before confirming**
- **Email-to-Action Inbox — forward any email to actions@seta.com; the system parses and creates action items**
- **Notification Preferences — each user controls their email digest frequency (daily/weekly) and notification types**
- **Full notification history log — every email and Teams alert is logged with timestamp and recipient**
- **Source tagging — every action item records its source type (Teams / Voice / Email / Manual) for audit and analytics**

### 2.5 Database Schema — Key Updates

The action_items table is extended with voice and email fields:

| **Field**        | **Type**     | **Description**                                                        |
| ---------------- | ------------ | ---------------------------------------------------------------------- |
| source_type      | ENUM         | teams_meeting / voice_recording / email / manual / pmo_report          |
| audio_file_url   | TEXT         | Azure Blob URL for the original voice recording (if applicable)        |
| transcript       | TEXT         | Full AI-generated transcript of the voice or meeting recording         |
| email_thread_id  | VARCHAR(255) | Outlook email thread ID for email-sourced actions                      |
| notification_log | JSONB        | Log of all email/Teams notifications sent (timestamp, recipient, type) |
| evidence         | TEXT / URL   | Link or attachment proving completion (Tier 1–3)                       |
| owner_id         | UUID (FK)    | Reference to the responsible employee                                  |
| deadline         | DATE         | Required completion date                                               |
| status           | ENUM         | Open / In Progress / Done / Blocked                                    |

## Phase 3 — AI-Powered Execution Intelligence Platform (Months 3–6)

Evolve the system into a full Action Intelligence Platform that leverages AI across all input channels — Teams meetings, emails, and voice recordings — to extract, analyse, and act on execution data at scale.

### 3.1 Target Architecture — 6 Layers

| **Layer**                     | **Description**                                                                                                                                                                                                                                 |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Layer 1 — Data Capture**    | Ingest from: Teams meeting transcripts, Outlook emails (via dedicated mailbox), voice recordings (mobile/upload), manual input, and PMO reports.                                                                                                |
| **Layer 2 — AI Extraction**   | LLM agents automatically detect and extract action items from all source types. Outputs: Task, Owner, Deadline, Priority, Impact, Confidence score.                                                                                             |
| **Layer 3 — Action Database** | Centralised PostgreSQL database as the core organisational asset. Stores all actions, transcripts, audio references, notification logs, and evidence.                                                                                           |
| **Layer 4 — Execution Sync**  | Bi-directional sync with Microsoft Planner and To Do. Notifications delivered via both Teams and Outlook email with full event logging.                                                                                                         |
| **Layer 5 — Intelligence**    | LLM analytics: identify deadline patterns, flag at-risk projects, score employee execution KPIs, predict project risk from action backlogs. Cross-source insight (e.g., 'This item was raised in a voice note 2 weeks ago but never assigned'). |
| **Layer 6 — AI Agents**       | Autonomous agents: follow up on overdue items, escalate delays via email + Teams, suggest reprioritisation, generate weekly execution health summaries.                                                                                         |

### 3.2 Unified Notification Architecture

Across all phases, every action item triggers notifications through a dual-channel system:

| **Event**                     | **Teams Notification**                  | **Outlook Email**                           |
| ----------------------------- | --------------------------------------- | ------------------------------------------- |
| New action assigned           | Channel mention + personal notification | Immediate email to owner with full details  |
| Deadline approaching (3 days) | Planner reminder                        | Email to owner + cc manager                 |
| Deadline approaching (1 day)  | Urgent Planner reminder                 | Urgent email to owner + cc manager          |
| Overdue                       | Escalation message in channel           | Escalation email to owner, manager, PMO     |
| Action completed              | Completion post in channel              | Acknowledgement email to requester          |
| Weekly digest                 | Personal summary card in To Do          | Monday morning summary to each staff member |
| Voice action extracted        | Notification to submitter for review    | Email with extracted draft for confirmation |

# 4. Evidence-Based Completion Model

Actions should not be marked 'Done' without documented evidence. We recommend the following three-tier model:

| **Tier**      | **Evidence Type**                    | **Examples**                              | **Required for...**           |
| ------------- | ------------------------------------ | ----------------------------------------- | ----------------------------- |
| Tier 1 — Text | Completion note written by the owner | Summary of what was done and outcome      | All action items              |
| Tier 2 — Link | URL to a document or deliverable     | SharePoint doc, Teams file, Confluence    | Impact score >= 3             |
| Tier 3 — File | Uploaded file attachment             | Screenshot, signed document, test results | Impact score >= 4 (mandatory) |

For voice-sourced action items, the original audio recording URL is automatically attached as additional context alongside the AI transcript, providing an auditable source of truth.

# 5. Commercialisation Roadmap

The Action Intelligence Platform has strong potential beyond internal use at SETA. The core problem it solves — capturing, assigning, and following up on action items from meetings, emails, and casual conversations — is universal across every organisation. This section outlines how SETA can position and commercialise this platform.

## 5.1 Market Opportunity

Organisations of 100–2,000 people universally struggle with action item accountability. Existing tools (Asana, Monday.com, Jira, Planner) focus on project management rather than meeting execution intelligence. The specific combination of multi-source capture (meetings + email + voice), AI extraction, and LLM analytics represents an underserved niche.

- Target segments: Professional services, consulting firms, IT outsourcing companies, PMO-heavy enterprises
- Geographic focus: SEA region initially (Vietnam, Thailand, Indonesia), then broader APAC
- Differentiator: Native voice capture for casual conversations — no competitor does this well for non-English markets

## 5.2 Commercialisation Strategy — Three Paths

| **Path**                        | **Model**                                                            | **Timeline**                                                                                                                    |
| ------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Path A — Internal Product       | Use within SETA / BlueOC group only. Prove the model, measure ROI.   | Now – Month 6: Build and validate internally. Measure: action capture rate, on-time completion rate, missed deadline reduction. |
| Path B — BlueOC Client Offering | Package as a managed service or licensed product for BlueOC clients. | Months 6–12: White-label the platform. Offer as a value-add to existing BlueOC enterprise clients at a per-seat fee.            |
| Path C — SaaS Product           | Full multi-tenant SaaS product sold independently.                   | Year 2+: Launch as a standalone SaaS product with self-serve onboarding, subscription pricing, and dedicated sales/support.     |

## 5.3 SaaS Architecture Requirements (Design Now, Build Later)

To avoid a costly rearchitecture later, the Phase 2 system should be built with these commercialisation-ready principles from day one:

- **Multi-tenancy — data must be logically isolated per organisation using a tenant_id on every database table**
  - Each tenant gets their own action database, user accounts, and notification configuration
- **Subscription tier logic — feature flags to enable/disable capabilities by plan (Basic / Pro / Enterprise)**
  - Example: Basic = manual entry only; Pro = Teams + email integration; Enterprise = voice capture + AI analytics
- **SSO & Identity — support Microsoft Entra ID (Azure AD) for enterprise clients and email/password for smaller customers**
- **API-first design — all features exposed via REST API so customers can integrate with their own systems**
- **Usage metering — track actions created, voice minutes processed, and AI queries per tenant for billing purposes**
- **Data residency — design for regional deployment (Vietnam, Singapore, Australia) to meet data sovereignty requirements**

## 5.4 Suggested Pricing Model

| **Plan**   | **Price (indicative)** | **Included Features**                                                                                       |
| ---------- | ---------------------- | ----------------------------------------------------------------------------------------------------------- |
| Basic      | Free / freemium        | Manual action entry, email notifications, up to 3 users, 100 actions/month                                  |
| Pro        | $8–15 USD/user/month   | Teams integration, Outlook notifications, search & filter, dashboard, up to 50 users                        |
| Enterprise | Custom / negotiated    | Voice capture, AI extraction, LLM analytics, AI agents, SSO, API access, unlimited users, dedicated support |

## 5.5 Competitive Positioning

**Key differentiator: SETA's platform is the only action management tool with native voice recording for casual conversations, multilingual AI extraction (Vietnamese + English), and deep Microsoft 365 integration — purpose-built for SEA-based professional services firms.**

The voice capture feature is particularly defensible because it solves a problem that large SaaS vendors (Asana, Monday.com) are unlikely to prioritise for the SEA market in the near term.

# 6. Implementation Roadmap

| **Phase**   | **Timeline** | **Key Activities**                                                                                                                                                                                                                                                                            |
| ----------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 1     | Weeks 1–3    | Deploy Microsoft Lists as action tracker. Configure Planner per Teams channel. Adopt Loop for meeting capture. Set up Power Automate for both Teams notifications AND Outlook email notifications. Standardise action format company-wide.                                                    |
| Phase 2     | Months 1–2   | Build PostgreSQL action database with commercialisation-ready multi-tenant schema. Develop internal web + mobile PWA. Implement voice recording capture with Azure Speech / Whisper transcription and LLM extraction. Launch evidence attachment. Go live with internal DB as primary system. |
| Phase 3     | Months 3–6   | Integrate full AI intelligence layer (analytics, risk scoring, execution KPIs). Deploy AI agents for automated follow-up and escalation via email + Teams. Launch Execution Intelligence Dashboard. Validate commercialisation metrics for Path A.                                            |
| Commercial  | Months 6–12  | Package platform for BlueOC client offering (Path B). Build self-serve onboarding. Define subscription tiers. Pilot with 2–3 external clients.                                                                                                                                                |
| SaaS Launch | Year 2+      | Launch standalone SaaS product with full multi-tenant infrastructure, subscription billing, regional data residency, and dedicated sales motion.                                                                                                                                              |

# 7. Strategic Value & Alignment

This platform serves SETA's four strategic pillars simultaneously:

| **Strategic Pillar**         | **How This Platform Contributes**                                                                                                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **PMO Governance**           | Complete visibility into execution status across all projects and departments. Early intervention capability. Auditable action history with evidence.                                 |
| **AI Transformation Vision** | Creates a high-quality, organisation-specific dataset for LLM training. Powers AI-native management through voice extraction, intelligent analytics, and autonomous agents.           |
| **SDLC Agent Strategy**      | Establishes the pattern and infrastructure for agentic AI systems within SETA, applicable beyond action management to the full software delivery lifecycle.                           |
| **Revenue Growth**           | Commercialisation roadmap creates a new revenue stream for SETA/BlueOC. Potential to become a flagship AI product that differentiates BlueOC in the SEA professional services market. |

# 8. Recommendation

Given SETA's scale (~400 staff), multi-project complexity, and AI-first strategic direction, we recommend the following:

Do NOT rely solely on Teams notifications — add Outlook email notifications in Phase 1 to maximise accountability reach across all staff.

Do NOT ignore casual voice conversations — a significant share of decisions and action items arise outside formal meetings and are currently lost entirely.

Do build with commercialisation in mind from Phase 2 — multi-tenancy and API-first design costs little extra now but saves months of rework later.

Commit to the following five-stage plan:

1. Phase 1 (Weeks 1–3): Deploy Microsoft Lists + Planner + Loop + Power Automate. Activate BOTH Teams and Outlook email notifications.
2. Phase 2 (Months 1–2): Build internal Action DB with voice capture, email-to-action inbox, and multi-tenant-ready schema.
3. Phase 3 (Months 3–6): Add AI intelligence layer and autonomous agents. Validate internal ROI.
4. Commercial Pilot (Months 6–12): Package for BlueOC clients. Launch Path B offering.
5. SaaS Launch (Year 2+): Full standalone product. Dedicated sales, support, and regional infrastructure.

**End goal: SETA's Action Intelligence Platform becomes the execution visibility layer and governance backbone internally, and a commercially viable AI SaaS product externally — generating recurring revenue while demonstrating SETA's AI-first capabilities to the market.**

# 9. Next Steps

To proceed, we recommend scheduling a kick-off meeting with the following agenda:

1. Approve this proposal and confirm phased approach
2. Assign a Phase 1 project owner (IT + PMO joint ownership recommended)
3. Configure the dedicated Outlook action mailbox (actions@seta.com) and Power Automate flows
4. Pilot the voice recording feature with one team for 4 weeks before full rollout
5. Initiate commercialisation scoping: identify 2–3 BlueOC clients for the first external pilot
6. Define success KPIs: action capture rate, on-time completion rate, evidence compliance rate, voice adoption rate

This document is version 2.0. All feedback should be directed to the Technology & AI Strategy Office. The proposal will be updated as decisions are confirmed.
