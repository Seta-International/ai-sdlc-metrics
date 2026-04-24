# Member Details Screen Redesign — Design Spec

**Date:** 2026-04-24
**Module:** `web-people`
**Route:** `/profile/[employmentId]`
**Source mockup:** `docs/raws/design/project/people/profile.jsx`, `docs/raws/design/project/people/hr-tasks.jsx`

---

## Overview

Full redesign of the employee profile screen (`/profile/[employmentId]`) to match the new design mockup. This is a complete spec rewrite (Option B): all profile components are reorganised into a clean sub-directory hierarchy, and every tab receives a full UI redesign based on the mockup.

Tab set: **Overview · Job history · Documents · Compensation · Change requests · Activity**

---

## Section 1: Directory Structure & Page Flow

```
src/components/profile/
  index.ts                        ← barrel: exports ProfilePage only
  ProfilePage.tsx                 ← data fetch, permissions, tab state
  hero/
    ProfileHero.tsx               ← avatar + meta + tab strip + terminated banner
    RehireDialog.tsx              ← UI stub
  tabs/
    TabOverview.tsx               ← 2-col grid + side rail
    TabJobHistory.tsx             ← timeline rewrite
    TabDocuments.tsx              ← grouped-by-kind rewrite
    TabCompensation.tsx           ← 3-col current + history rewrite
    TabChangeRequests.tsx         ← UI stub (mock data)
    TabActivity.tsx               ← UI stub (mock data)
  cards/
    ProfileCard.tsx               ← KV card with title + action
    SideCard.tsx                  ← compact rail widget
  rail/
    SideRail.tsx                  ← Completeness + Reports to + Direct reports + Recent activity
```

**Files deleted:**

- `src/components/profile/ProfileHeader.tsx`
- `src/components/profile/ProfileTabs.tsx`
- `src/components/profile/InfoCard.tsx`
- `src/components/profile/TabContracts.tsx`
- `src/components/profile/TabSections.tsx`
- `src/components/profile/TabProbation.tsx`

**`ProfilePage.tsx`** owns all state previously split between `page.tsx`, `ProfileHeader`, and `ProfileTabs`:

- Data fetch via `trpc.people.getEmployment.query({ employmentId })`
- Permission derivation (same `ProfilePermissions` shape as today)
- Tab state: `activeTab` read from `?tab=` search param via `useSearchParams()`; tab changes call `router.replace()`
- Renders:

```tsx
<Tabs value={activeTab} onValueChange={handleTabChange}>
  <ProfileHero profile={profile} permissions={permissions} onEdit={...} onShare={...} onStartOffboarding={...} />
  <TabsContent value="overview">      <TabOverview ... />        </TabsContent>
  <TabsContent value="job-history">   <TabJobHistory ... />      </TabsContent>
  <TabsContent value="documents">     <TabDocuments ... />       </TabsContent>
  <TabsContent value="compensation">  <TabCompensation ... />    </TabsContent>
  <TabsContent value="changes">       <TabChangeRequests ... />  </TabsContent>
  <TabsContent value="activity">      <TabActivity ... />        </TabsContent>
</Tabs>
```

`ProfileHero` renders `<TabsList>` but does not wrap `<Tabs>` — the context lives in `ProfilePage`.

**`page.tsx` after refactor:**

```tsx
import { ProfilePage } from '../../../components/profile'
export default function EmployeeProfilePage() {
  const params = useParams()
  return <ProfilePage employmentId={params.employmentId as string} />
}
```

---

## Section 2: ProfileHero

**Props:**

```ts
interface ProfileHeroProps {
  profile: EmployeeProfile
  permissions: ProfilePermissions
  onEdit: () => void
  onShare: () => void
  onStartOffboarding?: () => void
}
```

**Visual structure (top to bottom):**

- **Action buttons** (top-right): "Edit profile" primary (`canEdit` only) · "Share" ghost (always) · More `DropdownMenu` (`canManage` only): Download PDF, Start Offboarding
- **Avatar** — 72px circle, initials fallback, department colour ring derived from `currentJob.departmentId`
- **Name row** — `fullName` + `preferredName` in parens (if set) + `<StatusBadge>` inline
- **Meta row** — job title · `<dept colour dot>` department · location · level (IBM Plex Mono) — all from `currentJob`
- **Contact row** — mail icon + `companyEmail` · phone icon + `personProfile.phone` (if set) · calendar icon + "Joined X months ago" derived from `hireDate`
- **Terminated banner** — red alert bar shown when `employmentStatus === 'terminated'`:
  - Text: "Employment ended {terminationDate} · {terminationReason}"
  - Sub-text: "Read-only. Record preserved for compliance. Previous profile: {employeeCode}"
  - "Rehire" button → opens `RehireDialog`
- **Tab strip** — `<TabsList>` flush at the bottom of the hero section with `border-b` separator. Six triggers: Overview · Job history · Documents · Compensation · Change requests · Activity

**Changes vs current `ProfileHeader`:**

- Completeness bar removed (moves to side rail)
- Status badge moves inline with name
- Avatar 96px → 72px
- Contact info row is new

### RehireDialog (UI stub)

File: `hero/RehireDialog.tsx`

A modal dialog with:

- New start date (date picker)
- Employment type (select: Permanent / Fixed-term / Intern)
- Job title (text input)
- Cancel + "Start rehire" buttons

The submit handler logs to console and closes the dialog. Marked `// TODO: wire to people.rehireEmployee mutation`.

---

## Section 3: TabOverview

**Layout:** `grid grid-cols-[1fr_300px] gap-8 p-8`

### Main column — 4 ProfileCard sections

**`ProfileCard`** (`cards/ProfileCard.tsx`):

- Header row: title (left) + ghost action button (right, e.g. "Edit")
- Body: `<KVRow>` items — 160px label column + value column, `border-b` between rows
- `locked` prop: shows lock icon in header + permission message instead of content
- Props: `title`, `action?: { label: string; onClick: () => void }`, `locked?: boolean`, `children`

**Sections (top to bottom):**

1. **About** — Preferred name, pronouns (`personProfile.pronouns`, new optional field), start date, employee ID (monospace)
2. **Job** — Job title, level (monospace), department, employment type, work arrangement
3. **Compensation** — Always visible card. When `!canViewSalary`: lock icon + "Restricted. You can view salary with `people:salary:read` permission." When `canViewSalary`: base salary + currency from active contract
4. **Emergency contacts** — Each contact as an avatar row: avatar (28px) + name (bold) + relationship · phone + "Primary" pill on first contact

### Side rail — SideRail

File: `rail/SideRail.tsx` — assembles four `SideCard` widgets.

**`SideCard`** (`cards/SideCard.tsx`):

- Compact card, uppercase 10px tracking-wide label header, count badge if provided, no edit action
- Props: `title`, `count?: number`, `children`

**Widgets (top to bottom):**

1. **Completeness** — score (24px bold number) + "%" + "X missing" accent pill + 4px progress bar + list of missing field names with amber dot
2. **Reports to** — manager avatar (26px) + name + title; sourced from `currentJob.managerName` / `currentJob.managerId`
3. **Direct reports** — fetched via `people.getDirectReports`; avatar (22px) + name + title rows; count badge in header; skeleton while loading
4. **Recent activity** — last 3 entries from `people.getActivityFeed` (limit: 3); event text + relative time; "View all" link switches to Activity tab

---

## Section 4: TabJobHistory

**Layout:** `grid grid-cols-[1fr_300px] gap-8 p-6`

### Main column — vertical timeline

Header row: "Job history" label + "{N} events · {X} months" subheading + Export button (ghost) + Add event button (primary, `canEdit` only).

Timeline rail: absolute `left: 9px` vertical line (`rgba(255,255,255,0.06)`), events rendered top-to-bottom with `paddingLeft: 24px`.

**Event types and icons:**

| Type        | Icon       | Colour    |
| ----------- | ---------- | --------- |
| `hire`      | Plus       | `#10b981` |
| `promotion` | ArrowUp    | `#7170ff` |
| `comp`      | DollarSign | `#10b981` |
| `manager`   | Users      | `#06b6d4` |
| `transfer`  | Share2     | `#f59e0b` |

Each event card: coloured icon dot on the rail · date (muted, right-aligned) · type label (uppercase 10px) · "From → To" row with from value struck-through · reason text · "by {name}" attribution.

**Data source:** `people.getJobHistory({ employmentId })` — returns typed `JobEvent[]`. Handler returns hardcoded seed events matching the mockup. Marked `// TODO: replace with real job_assignment history query`.

### Right side rail

Two `SideCard` widgets:

1. **Tenure** — hire date + total months in bold
2. **Event summary** — count per event type (Promotions, Comp changes, Transfers, Manager changes)

---

## Section 5: TabDocuments

**Layout:** single full-width column, `p-6`

### Header row

"Documents" label + count badge + Upload button (primary, `canUpload` only).

### Document list — grouped by kind

Documents grouped into sections: Contract · Letter · Tax · Legal · Media. Each section has an uppercase 10px kind header, then document rows below.

**Document row:** checkbox (multi-select, shown only when `canUpload`) · file icon · file name (bold) · size + uploaded date + "by {name}" (muted) · "required" tag pill if tagged · row hover reveals Download icon + (when `canUpload`) Delete icon.

**Bulk action bar** — appears above the list when ≥1 document selected (only possible when `canUpload`): "{N} selected" · Download selected · Delete selected (danger). Dismisses on deselect-all.

**Delete confirmation dialog** — triggered on single or bulk delete: "Delete {N} document(s)?" with file names listed, Cancel + "Delete" danger button. Submit handler calls the existing `people.deleteDocument` mutation.

**Empty state** — "No documents yet." + Upload button if `canUpload`.

**Data source:** existing `people.getDocuments({ employmentId })` query. No new API needed.

---

## Section 6: TabCompensation

**Layout:** `grid grid-cols-[1fr_300px] gap-8 p-6`

### Main column

**Current block** (top) — `ProfileCard` titled "Current" with "Adjust" ghost action (`canViewSalary && canEdit` only):

- 3-column grid: Base salary (22px bold + delta vs last e.g. "+18.3% vs last") · Equity (amount + vest schedule) · Target bonus (% + dollar-at-target)
- When `!canViewSalary`: lock icon + "Restricted. You can view salary with `people:salary:read` permission."

**Compensation history** — `ProfileCard` titled "History", no action:

- Each entry: date · type badge (Salary / Equity / Bonus) · from → to amounts · reason · "by {name}"
- Ordered newest first

**"Add contract"** button shown below history when `canCreateContract`.

### Right side rail

Two `SideCard` widgets:

1. **Total comp** — sum of base + equity annualised + target bonus; shown only when `canViewSalary`, otherwise hidden entirely
2. **Contract** — active contract type + date range + status badge

**Data source:** existing `people.getContracts({ employmentId })` query. No new API needed.

---

## Section 7: TabChangeRequests (UI stub)

**Layout:** `grid grid-cols-[1fr_420px]` — list panel left, detail panel right.

### List panel

- Filter pills: Pending · Approved · Rejected · All (hardcoded counts)
- Each row: employee avatar (24px) + name + title · field changed · from (strikethrough) → to · reason · age · "High" priority pill if applicable
- Selected row highlighted with left `#7170ff` border + subtle bg tint

### Detail panel (right)

- Darker bg, `border-l`
- "Request detail" uppercase label
- Employee avatar (36px) + name + title
- Field change card: "FROM" block (red tint, strikethrough) + "TO" block (green tint, bold)
- KV rows: Requested by · Reason · Submitted · Request ID (monospace)
- Approve (primary) + Reject (danger) buttons — both `console.log` no-ops, marked `// TODO: wire to people.approveChangeRequest / rejectChangeRequest`

**Mock data:** 3–5 hardcoded `ChangeRequest` objects covering different field types (title change, department transfer, work arrangement).

---

## Section 8: TabActivity (UI stub)

**Layout:** single column, `p-6`

- "Activity" label + total count
- Each entry: event-type icon (Edit / Check / File / Users) · description text · "by {actorName}" · relative timestamp
- Entries separated by `border-b`
- "Load more" button — always disabled, label "No more events"
- 5 hardcoded `ActivityEvent` objects: promotion, document upload, manager change, field edit, contract signed

Marked `// TODO: replace with real queries once backend is wired`.

---

## Section 9: New API Queries

### `people.getDirectReports`

- **Input:** `{ employmentId: string }`
- **Returns:** `{ directReports: DirectReport[] }`
- **Backend:** joins `job_assignment` → `employment` → `person_profile` where `manager_employment_id = input.employmentId` and `employment_status` in `('active', 'on_leave', 'notice_period')`
- **New type:**
  ```ts
  type DirectReport = {
    employmentId: string
    fullName: string
    jobTitle: string | null
    avatarUrl: string | null
  }
  ```

### `people.getActivityFeed`

- **Input:** `{ employmentId: string; cursor?: string; limit?: number }`
- **Returns:** `{ events: ActivityEvent[]; nextCursor: string | null }`
- **Backend:** stub — returns 5 hardcoded events + `nextCursor: null`. Marked `// TODO: replace with outbox_event query once activity logging is wired`
- **New type:**
  ```ts
  type ActivityEvent = {
    id: string
    eventType: string
    description: string
    actorName: string
    occurredAt: string
  }
  ```

### `people.getJobHistory`

- **Input:** `{ employmentId: string }`
- **Returns:** `{ events: JobEvent[] }`
- **Backend:** stub — returns 7 hardcoded events matching the mockup. Marked `// TODO: replace with real job_assignment history query`
- **New type:**
  ```ts
  type JobEvent = {
    type: 'hire' | 'promotion' | 'comp' | 'manager' | 'transfer'
    date: string
    from: string | null
    to: string
    by: string
    reason: string
  }
  ```

All three queries go through `RlsMiddleware` and are tenant-scoped.

---

## Section 10: Testing

All test files co-located (`.spec.tsx` next to the component). Target ≥70% coverage. No `__tests__/` directories.

### New unit tests

| File                              | What it covers                                                                                                                                       |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hero/ProfileHero.spec.tsx`       | Renders name + status badge; shows terminated banner when `terminated`; hides Rehire when not terminated; shows/hides action buttons per permissions |
| `hero/RehireDialog.spec.tsx`      | Dialog opens on Rehire click; cancel closes it; submit calls stub handler                                                                            |
| `cards/ProfileCard.spec.tsx`      | Renders KV rows; shows/hides edit action; shows lock state                                                                                           |
| `cards/SideCard.spec.tsx`         | Renders title, count badge, children                                                                                                                 |
| `rail/SideRail.spec.tsx`          | Renders all four widgets; shows skeleton while direct reports loading                                                                                |
| `tabs/TabOverview.spec.tsx`       | Two-column layout; side rail renders; compensation lock when `canViewSalary=false`                                                                   |
| `tabs/TabJobHistory.spec.tsx`     | Renders timeline events; hides Add event when `!canEdit`; correct icon per event type                                                                |
| `tabs/TabDocuments.spec.tsx`      | Groups docs by kind; bulk action bar appears on select; delete dialog opens                                                                          |
| `tabs/TabCompensation.spec.tsx`   | Shows lock when `canViewSalary=false`; renders current block + history when permitted                                                                |
| `tabs/TabChangeRequests.spec.tsx` | Renders mock requests; detail panel updates on row click; Approve/Reject buttons present                                                             |
| `tabs/TabActivity.spec.tsx`       | Renders 5 mock events; Load more button is disabled                                                                                                  |

### Updated tests

| File                                       | Change                                                            |
| ------------------------------------------ | ----------------------------------------------------------------- |
| `app/profile/[employmentId]/page.spec.tsx` | Assert `ProfileHero` renders; tab switching via `?tab=` URL param |

### Deleted tests

- `ProfileHeader.spec.tsx` — covered by `ProfileHero.spec.tsx`

### E2E

No new Playwright tests. Update existing profile E2E selectors for renamed tab labels ("Compensation" instead of "Contracts", "Activity" added).
