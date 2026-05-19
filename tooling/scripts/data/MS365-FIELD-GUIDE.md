# MS365 User Profile Fields — Setup & Licensing Guide

How to populate `jobTitle`, `department`, `skills`, and related fields in Microsoft 365 / Entra ID. Includes what is free, what costs extra, and the critical gotchas that will waste your time if you don't know them.

> **Accuracy note:** Reflects the state of MS365 / Entra ID as of May 2026, including the People Skills GA rollout (April 2025).

---

## Quick Reference: What Is Free?

| Field | Free? | Notes |
|---|---|---|
| `jobTitle`, `department`, `officeLocation` | **Yes** | Core directory fields, any M365 subscription |
| `displayName`, `givenName`, `surname` | **Yes** | Always writable by admin |
| `mail`, `mobilePhone`, `businessPhones` | **Yes** | `mobilePhone` has special permission requirements — see §3 |
| `employeeId`, `employeeType`, `employeeHireDate` | **Yes** | `employeeHireDate` needs `User-LifeCycleInfo.ReadWrite.All` scope |
| `employeeOrgData` (division, costCenter) | **Yes** | Sub-object with two properties |
| `usageLocation`, `city`, `country`, `postalCode` | **Yes** | `usageLocation` is required before you can assign an M365 license |
| `skills` (string array, v1.0) | **Yes** — but read §2 | Free to write; since June 2025 no longer shows on profile card |
| `aboutMe`, `interests`, `responsibilities`, `pastProjects`, `schools` | **Yes** | SharePoint-backed; separate PATCH required — see §3 |
| LinkedIn account connections | **Yes** | Admin enables; each user must consent |
| People Skills Foundation (manual skills) | **Yes** | Auto-enabled for M365 commercial tenants |
| People Skills AI inferencing | **Paid** | Requires M365 Copilot or a Viva license |
| SCIM / HR-driven provisioning (Workday, SAP) | **Paid — Entra P1** | Not available in Entra ID Free |
| Dynamic groups (e.g. auto-group by department) | **Paid — Entra P1** | |

---

## 1. Field Storage: Directory vs SharePoint

Before writing any code, understand that Entra ID user properties live in **two different backends**.

### Group A — Entra ID Directory fields
Stored in Azure Active Directory / Entra ID directly. Fast, strongly typed, writable with application tokens.

```
displayName, givenName, surname, jobTitle, department, officeLocation,
mail, mobilePhone, businessPhones, userPrincipalName,
employeeId, employeeType, employeeHireDate, employeeLeaveDateTime,
employeeOrgData { division, costCenter },
usageLocation, city, country, postalCode, state, streetAddress,
companyName, preferredLanguage, userType, accountEnabled
```

### Group B — SharePoint User Profile Application (UPA) fields
Stored in SharePoint Online's User Profile Application. Must be written in a **separate PATCH call** and require a **delegated (signed-in user) permission** — application-only tokens will fail.

```
skills, aboutMe, birthday, interests, mySite,
pastProjects, responsibilities, schools
```

> **The most common mistake:** Mixing Group A and Group B fields in a single PATCH body. The request will fail with a 400. Each Group B field needs its own isolated PATCH call.

---

## 2. The Skills Field — Three Overlapping Systems

Skills in Microsoft 365 are complicated because Microsoft is mid-migration between two systems. Here is how they relate.

### System 1: Legacy `skills` string array (Graph v1.0)

```
GET /users/{id}?$select=skills
→ { "skills": ["React", "TypeScript", "Node.js"] }

PATCH /users/{id}
Body (must contain ONLY this field, no others):
{ "skills": ["React", "TypeScript", "Node.js"] }
```

**Free.** No extra license. Any M365 subscription.

**But**: Since the People Skills rollout (June–July 2025, enabled on all commercial tenants), skills written here **no longer appear on the profile card** in Outlook, Teams, or SharePoint. They remain readable via Graph API and are used by Copilot search — but users cannot see them in the UI. Microsoft has acknowledged this but has not provided a migration path or timeline.

**Use this for**: machine-readable data the agent queries via API. Do not rely on it to be visible to end users.

### System 2: Rich skills via `/profile/skills` (Graph beta)

```
GET  https://graph.microsoft.com/beta/users/{id}/profile/skills
POST https://graph.microsoft.com/beta/me/profile/skills
```

Returns `skillProficiency` objects with `displayName`, `proficiency` (advancedProfessional, general, expert, …), `categories`, `collaborationTags` (ableToMentor, wantsToLearn, …), `allowedAudiences`.

**Free** (no extra license for the endpoint). But:
- **Beta only** — not supported in production by Microsoft.
- **Application-only tokens do not work.** Only delegated permissions work. This means you cannot bulk-set skills for all users from a service account — you need each user to be signed in.
- Skills written here also do not appear on the profile card in tenants with People Skills enabled. Same suppression issue as System 1.

**Use this for**: prototyping richer skill data shapes if you want proficiency levels. Not suitable for production bulk admin writes.

### System 3: Microsoft People Skills (GA April 2025)

The new system. Skills appear on profile cards in Outlook, Teams, SharePoint, and Copilot. Powered by a LinkedIn-backed taxonomy of 16,000+ skills.

| Tier | License | Capabilities |
|---|---|---|
| **Foundation** | Any M365 commercial (E3, E5, Business Premium, etc.) — **free** | Profile card shows skills, users manually add skills from taxonomy via profile editor, skills in people search and Org Explorer |
| **Advanced** | Viva Suite ($12/user/month), Viva Insights ($4/user/month), or Viva Learning ($4/user/month) | Foundation + **AI skill inferencing** from M365 activity signals |
| **Copilot** | M365 Copilot (separate Copilot license) | Advanced + Skills Agent, Workforce Insights Agent, Copilot skill queries |

**How users add skills**: They go to their profile card (in Outlook, Teams, or office.com), click "Edit profile", navigate to the Skills section, and search the built-in taxonomy. There is no admin portal to bulk-set skills through People Skills directly.

**How this affects our mock data**: The `skills` field in `raw` in our CSV matches what Graph API v1.0 returns — it is what the agent reads programmatically. The People Skills UI is a separate surface. For agent purposes (querying who has a skill to match to a task), reading `raw->>'skills'` from the DB is the right approach.

---

## 3. How to Set Each Field Type

### 3a. Via Microsoft 365 Admin Center (UI)

Best for small changes or one-off corrections.

1. Sign in as Global Admin or User Admin.
2. Go to **Microsoft 365 admin center → Users → Active users**.
3. Click a user → **Manage contact information** or the relevant section.
4. Edit fields and save.

**Bulk UI edit** (up to ~60 users at once):
1. Select multiple users in the Active users list.
2. Click **Edit properties** in the command bar.
3. Available bulk fields: City, Company, Country, Department, Job title, Office, Usage location. All selected users get the same value — you cannot set different values per user this way.

**Not available in the Admin Center UI**: skills, aboutMe, interests, pastProjects.

---

### 3b. Via Graph API (Recommended for Automation)

**Permissions needed**:
- `User.ReadWrite.All` — application permission, for admin writes to Group A fields.
- `User.ReadWrite` (delegated) — required for Group B fields (skills, aboutMe, etc.).

**Setting Group A fields (jobTitle, department, etc.)** — can mix freely:

```http
PATCH https://graph.microsoft.com/v1.0/users/{id}
Authorization: Bearer {token}
Content-Type: application/json

{
  "jobTitle": "Backend Developer",
  "department": "Backend Engineering",
  "officeLocation": "Ho Chi Minh City",
  "employeeId": "1042",
  "employeeType": "Full time",
  "usageLocation": "VN"
}
```

**Setting Group B fields (skills)** — must be a completely separate PATCH:

```http
PATCH https://graph.microsoft.com/v1.0/users/{id}
Authorization: Bearer {delegated-token}   ← must be delegated, NOT app-only
Content-Type: application/json

{
  "skills": ["React", "TypeScript", "Next.js"]
}
```

> **Gotcha for synced users**: If you use Entra ID Connect to sync from on-premises Active Directory, the AD is the source of authority for directory fields. Graph API writes to `jobTitle`, `department`, etc. will be **overwritten at the next sync cycle** (~30 minutes). For synced tenants, update the source AD attributes instead.

---

### 3c. Via PowerShell (Microsoft.Graph module)

Best for bulk updates from a CSV file without custom code.

**Install:**
```powershell
Install-Module Microsoft.Graph -Scope CurrentUser
```

**Connect (interactive login for delegated perms):**
```powershell
Connect-MgGraph -Scopes "User.ReadWrite.All"
```

**Update a single user:**
```powershell
Update-MgUser -UserId "nam.nguyen@setafuture.onmicrosoft.com" `
  -JobTitle "Backend Developer" `
  -Department "Backend Engineering" `
  -OfficeLocation "Ho Chi Minh City" `
  -EmployeeId "1042"
```

**Bulk update from CSV:**
```powershell
# CSV columns: UserPrincipalName, JobTitle, Department, EmployeeId
$users = Import-Csv "users.csv"
foreach ($u in $users) {
    Update-MgUser -UserId $u.UserPrincipalName `
        -JobTitle $u.JobTitle `
        -Department $u.Department `
        -EmployeeId $u.EmployeeId
    Write-Host "Updated: $($u.UserPrincipalName)"
}
```

**Bulk update skills (requires delegated auth — user must be signed in):**
```powershell
# Note: application-only auth will fail for skills
Update-MgUser -UserId $userId -Skills @("React", "TypeScript", "PostgreSQL")
```

No extra license required for PowerShell or Graph API bulk updates.

---

### 3d. SCIM / HR-Driven Provisioning

Automatically syncs user attributes from an HR system (Workday, SAP SuccessFactors, BambooHR, etc.) into Entra ID on a schedule.

**License required: Entra ID P1** (not available in Entra ID Free).

**Included in**: Microsoft 365 E3, Business Premium, EMS E3.

**Standalone price**: ~$6/user/month (Entra ID P1).

**Fields supported via SCIM**: `jobTitle`, `department`, `displayName`, `mail`, `mobilePhone`, `employeeId`, `employeeType`, `manager`, `city`, `country`, `usageLocation`, and custom extension attributes.

**Not supported via SCIM**: `skills`, `aboutMe`, `interests` (SharePoint UPA fields have no SCIM mapping).

**Setup steps** (high level):
1. Entra admin center → Identity → Applications → Enterprise applications.
2. Add your HR application (Workday, SAP, etc.) from the gallery.
3. Configure provisioning: set credentials, map attributes, define scope.
4. Enable provisioning — Entra polls the HR system every 20–40 minutes.

**API-driven inbound provisioning** (push from HR system via SCIM API): Also requires P1. Allows the HR system to push changes on event rather than waiting for a poll cycle.

---

### 3e. Entra ID Connect (On-Premises AD Sync)

If your organization has an on-premises Active Directory, Entra ID Connect syncs attributes to Entra ID automatically. The sync tool itself is **free**.

**Attributes that sync from on-premises AD:**

| AD Attribute | Graph API Field |
|---|---|
| `title` | `jobTitle` |
| `department` | `department` |
| `physicalDeliveryOfficeName` | `officeLocation` |
| `manager` | `manager` (navigationProperty) |
| `employeeID` | `employeeId` |
| `mobile` | `mobilePhone` |
| `telephoneNumber` | `businessPhones` |
| `l` (locality) | `city` |
| `co` / `countryCode` | `country` / `usageLocation` |
| `givenName`, `sn`, `displayName` | `givenName`, `surname`, `displayName` |

**Does NOT sync**: `skills`, `aboutMe`, `interests`, `pastProjects` — these have no Active Directory equivalent. For synced users these must be set through Graph API with delegated permissions or through the People Skills profile editor by users themselves.

**Important**: For synced users, the **on-premises AD is the write authority**. If you write `jobTitle` via Graph API for a synced user, it will be overwritten at the next Connect sync cycle (~30 min). Always update the source.

---

## 4. LinkedIn Account Connections

Makes LinkedIn profile information visible in M365 profile cards (Teams, Outlook, SharePoint, Delve).

**License**: None required. Available in any Entra ID subscription. **Free**.

**How to enable (admin)**:
1. Entra admin center → Users → User settings.
2. Under "LinkedIn account connections", select **Yes** (all users) or **Selected group** (a security group).
3. Save.

**What users see after admin enables it**:
- A "Connect your LinkedIn account" prompt in their profile.
- Public LinkedIn profile info (name, title, photo) becomes visible on other users' cards even without their individual consent.
- Full data (mutual connections, education, shared groups) requires each user to consent and connect their LinkedIn account.

**Exceptions**: Not available for Microsoft Cloud for US Government (GCC), Microsoft Cloud Germany, or Azure/M365 operated by 21Vianet (China).

---

## 5. Licensing Summary for This Project

| What we need to do | License needed | Cost |
|---|---|---|
| Read/write `jobTitle`, `department`, etc. via Graph API | None | Free |
| Bulk update via PowerShell | None | Free |
| Read `skills` via Graph API (`raw.skills`) | None | Free |
| Write `skills` via Graph API | None (but won't show on profile card) | Free |
| Show skills on profile card (People Skills) | None — Foundation is included | Free |
| AI-infer skills from M365 activity | M365 Copilot or Viva license | ~$4–$30/user/month |
| Sync from HR system (Workday, SAP) | Entra ID P1 | ~$6/user/month |
| Auto-group users by department or jobTitle (dynamic groups) | Entra ID P1 | ~$6/user/month |
| LinkedIn profile data in cards | None | Free |
| Rich `/profile/skills` (proficiency levels, endorsements) | None — but beta only, delegated auth only | Free but not production-ready |

**For the agent use case** (recommending team members based on skills and workload):

- Reading `skills` from Graph API and storing in `raw` — **free, no extra license**.
- Querying `assignee_ids` and task load — **free**.
- The agent can answer skill-matching questions today using the data already in the DB without any additional licensing.
- AI-powered skill inferencing (auto-building skill profiles from emails, meetings, documents) would require Viva Insights or Copilot, but that is optional enrichment — not required for the core agent feature.

---

## 6. Recommended Setup for This Tenant

For the `setafuture.onmicrosoft.com` tenant, the practical path to populate real data:

1. **`jobTitle`, `department`, `officeLocation`, `employeeId`, `employeeType`** — set via PowerShell bulk script from an HR CSV export. No license needed. Runs in minutes.

2. **`skills`** — two options:
   - **For the agent (machine-readable)**: Write via `PATCH /users/{id}` with `{"skills": [...]}` using delegated auth. Queryable via Graph API. Free. Will not appear on profile card UI.
   - **For the profile card (user-visible)**: Have users self-add through the People Skills editor (their profile card in Teams/Outlook). Foundation tier is included free — no admin action needed beyond ensuring it's not disabled.

3. **`manager`** — set via Graph API: `PATCH /users/{id}` with `$ref` on the manager navigation property. Free. Required for org-chart queries.

4. **HR system sync** — if you want attributes to stay in sync automatically as people join or change roles, Entra ID P1 is required for SCIM provisioning. Without P1, run the PowerShell script periodically (e.g. monthly from an HR export).

5. **LinkedIn** — enable in Entra admin center. Free. Adds professional context to profile cards without any configuration cost.
