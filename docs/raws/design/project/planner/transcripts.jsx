// Transcripts — modular surfaces for the meeting → action pipeline.
// PRD §6.1 (REQ-10, REQ-11, REQ-19b/c/d/e/i) & NFR-13. Modeled on the
// People module's page-per-surface pattern:
//
//   01 TranscriptsListView     — meetings list (hero landing)
//   02 TranscriptDetailView    — one meeting: transcript + proposals (HITL)
//   03 ProposalInboxView       — cross-meeting review queue (PMO)
//   04 CaptureSettingsView     — opt-out / capture scope / audit
//
// All four share the fixture bundle at the top.

// ============ FIXTURE DATA ============
const TRANSCRIPT_DATA = {
  MEETINGS: [
    {
      id: 'm-2026-04-22-standup',
      title: 'Q1 Launch · Daily standup',
      when: 'Tue, Apr 22 · 09:30 – 09:52',
      day: 'Today',
      organiser: 'u1',
      attendees: ['u1', 'u2', 'u3', 'u4', 'u7'],
      duration: '22m',
      transcriptStatus: 'ready',
      proposalCount: 4,
      pendingCount: 2,
      source: 'Microsoft Teams',
      series: 'Daily · Mon-Fri',
      active: true,
    },
    {
      id: 'm-2026-04-21-exec',
      title: 'Exec sync · Planner pilot readiness',
      when: 'Mon, Apr 21 · 15:00 – 15:48',
      day: 'Yesterday',
      organiser: 'u7',
      attendees: ['u7', 'u1', 'u6'],
      duration: '48m',
      transcriptStatus: 'ready',
      proposalCount: 6,
      pendingCount: 6,
      source: 'Microsoft Teams',
      series: null,
    },
    {
      id: 'm-2026-04-21-account',
      title: 'Account review · Client Northwind',
      when: 'Mon, Apr 21 · 11:00 – 11:55',
      day: 'Yesterday',
      organiser: 'u4',
      attendees: ['u4', 'u5', 'u3'],
      duration: '55m',
      transcriptStatus: 'ready',
      proposalCount: 3,
      pendingCount: 0,
      source: 'Microsoft Teams',
      series: 'Weekly · Mondays',
    },
    {
      id: 'm-2026-04-20-designcrit',
      title: 'Design crit · Label editor',
      when: 'Mon, Apr 20 · 14:00 – 14:35',
      day: 'This week',
      organiser: 'u2',
      attendees: ['u2', 'u1', 'u6'],
      duration: '35m',
      transcriptStatus: 'ready',
      proposalCount: 2,
      pendingCount: 0,
      source: 'Microsoft Teams',
      series: null,
    },
    {
      id: 'm-2026-04-20-1on1',
      title: '1:1 · Ana / Mei',
      when: 'Mon, Apr 20 · 10:00 – 10:30',
      day: 'This week',
      organiser: 'u1',
      attendees: ['u1', 'u2'],
      duration: '30m',
      transcriptStatus: 'opted-out',
      proposalCount: 0,
      pendingCount: 0,
      optOut: true,
      source: 'Microsoft Teams',
      series: 'Weekly 1:1',
    },
    {
      id: 'm-2026-04-19-planning',
      title: 'Sprint planning · Q1 Launch',
      when: 'Fri, Apr 19 · 13:00 – 14:20',
      day: 'This week',
      organiser: 'u1',
      attendees: ['u1', 'u2', 'u3', 'u4', 'u5', 'u7'],
      duration: '1h 20m',
      transcriptStatus: 'processing',
      proposalCount: 0,
      pendingCount: 0,
      source: 'Microsoft Teams',
      series: null,
    },
  ],
  TRANSCRIPT: [
    {
      t: '09:30:18',
      who: 'u1',
      text: "Alright, let's kick off. Ana here, running standup. Mei, you want to start?",
    },
    {
      t: '09:30:41',
      who: 'u2',
      text: "Sure. Yesterday I finished the color picker for the label editor. Today I'm going to push the slot-model migration through review — Diego has already signed off.",
    },
    {
      t: '09:31:02',
      who: 'u2',
      text: 'One thing — I need someone to double-check the focus-trap on the picker. Accessibility audit flagged it.',
      proposals: ['p1'],
    },
    {
      t: '09:31:28',
      who: 'u3',
      text: "I can take that. I'll have it done by Thursday.",
      proposals: ['p1'],
    },
    {
      t: '09:31:45',
      who: 'u1',
      text: "Great. Diego — you're on the focus trap, Thursday. Next up, Priya.",
    },
    {
      t: '09:32:02',
      who: 'u4',
      text: "Northwind review went fine yesterday. They want a status summary by end of week — I'll draft it tomorrow and share for review.",
      proposals: ['p2'],
    },
    { t: '09:32:28', who: 'u1', text: "Who's reviewing?" },
    { t: '09:32:31', who: 'u4', text: 'You, ideally. Or whoever has bandwidth.' },
    { t: '09:32:40', who: 'u1', text: "I'll do it. Send it my way Wednesday morning." },
    {
      t: '09:33:05',
      who: 'u7',
      text: 'Quick flag from the exec sync — Hung wants the executive digest rendering locked by next Monday. Someone should own that.',
      proposals: ['p3'],
    },
    { t: '09:33:22', who: 'u1', text: "Let's figure that out after standup. Noted." },
    {
      t: '09:33:40',
      who: 'u5',
      text: "Omar — I'm still on the skeleton loaders for the task detail panel. Should be done today.",
    },
    { t: '09:33:58', who: 'u1', text: 'Any blockers?' },
    { t: '09:34:02', who: 'u5', text: 'None.' },
    {
      t: '09:34:18',
      who: 'u3',
      text: "One more — we should decide the telemetry retention window this week. It's been open in backlog for two sprints.",
      proposals: ['p4'],
    },
    {
      t: '09:34:35',
      who: 'u1',
      text: "Fair. Let's say someone drafts a proposal by Friday — we can decide async.",
    },
    { t: '09:34:48', who: 'u3', text: "I'll pick it up." },
  ],
  PROPOSALS: [
    {
      id: 'p1',
      meetingId: 'm-2026-04-22-standup',
      meetingTitle: 'Q1 Launch · Daily standup',
      status: 'pending',
      title: 'Fix focus-trap on label editor color picker',
      owner: 'u3',
      ownerConfidence: 0.94,
      due: '2026-04-24',
      priority: 5,
      labels: [2, 3],
      bucket: 'To do',
      sourceTs: '09:31:02',
      reasoning:
        'Mei asked for someone to double-check the focus trap; Diego volunteered and committed to Thursday.',
      confidence: 0.89,
    },
    {
      id: 'p2',
      meetingId: 'm-2026-04-22-standup',
      meetingTitle: 'Q1 Launch · Daily standup',
      status: 'pending',
      title: 'Draft Northwind status summary for end-of-week review',
      owner: 'u4',
      ownerConfidence: 0.98,
      due: '2026-04-23',
      priority: 5,
      labels: [5],
      bucket: 'To do',
      sourceTs: '09:32:02',
      reasoning:
        'Priya explicitly committed to draft the Northwind status summary Wednesday morning for Ana to review.',
      confidence: 0.92,
    },
    {
      id: 'p3',
      meetingId: 'm-2026-04-22-standup',
      meetingTitle: 'Q1 Launch · Daily standup',
      status: 'unassigned',
      title: 'Own executive digest rendering · lock by Monday',
      owner: null,
      ownerConfidence: 0.22,
      due: '2026-04-27',
      priority: 9,
      labels: [1, 5],
      bucket: 'To do',
      sourceTs: '09:33:05',
      reasoning:
        '"Someone should own that" — no explicit owner in the transcript. Routed to meeting organiser for assignment (REQ-19i).',
      confidence: 0.71,
      unassignedReason: 'No explicit owner — transcript used "someone should own that".',
    },
    {
      id: 'p4',
      meetingId: 'm-2026-04-22-standup',
      meetingTitle: 'Q1 Launch · Daily standup',
      status: 'pending',
      title: 'Propose telemetry retention window · async decision by Friday',
      owner: 'u3',
      ownerConfidence: 0.88,
      due: '2026-04-25',
      priority: 3,
      labels: [4],
      bucket: 'Backlog',
      sourceTs: '09:34:18',
      reasoning:
        'Diego volunteered to pick up the retention-window proposal after Ana set a Friday deadline.',
      confidence: 0.84,
    },
    {
      id: 'p5',
      meetingId: 'm-2026-04-22-standup',
      meetingTitle: 'Q1 Launch · Daily standup',
      status: 'accepted',
      title: 'Finish skeleton loaders for task detail panel',
      owner: 'u5',
      ownerConfidence: 0.99,
      due: '2026-04-22',
      priority: 3,
      labels: [2],
      bucket: 'In progress',
      sourceTs: '09:33:40',
      reasoning: 'Omar committed in standup to finish skeleton loaders today.',
      confidence: 0.95,
      acceptedBy: 'u1',
      acceptedAt: '09:40',
    },
    {
      id: 'p6',
      meetingId: 'm-2026-04-22-standup',
      meetingTitle: 'Q1 Launch · Daily standup',
      status: 'rejected',
      title: 'Push slot-model migration through review',
      owner: 'u2',
      ownerConfidence: 0.96,
      due: '2026-04-22',
      priority: 3,
      labels: [1],
      bucket: 'In progress',
      sourceTs: '09:30:41',
      reasoning: "Mei said she'd push the migration through review today.",
      confidence: 0.87,
      rejectedReason: 'Already exists as TASK-1038 — duplicate.',
    },
    // cross-meeting proposals for inbox view
    {
      id: 'p7',
      meetingId: 'm-2026-04-21-exec',
      meetingTitle: 'Exec sync · Planner pilot readiness',
      status: 'pending',
      title: 'Prepare pilot readiness deck for PMO digest',
      owner: 'u1',
      ownerConfidence: 0.86,
      due: '2026-04-25',
      priority: 7,
      labels: [1],
      bucket: 'To do',
      sourceTs: '15:12:44',
      reasoning: 'Hung requested a readiness deck for the PMO digest. Ana accepted on the call.',
      confidence: 0.88,
    },
    {
      id: 'p8',
      meetingId: 'm-2026-04-21-exec',
      meetingTitle: 'Exec sync · Planner pilot readiness',
      status: 'pending',
      title: 'Lock down pilot rollout comms plan',
      owner: 'u7',
      ownerConfidence: 0.91,
      due: '2026-04-28',
      priority: 5,
      labels: [6],
      bucket: 'To do',
      sourceTs: '15:31:02',
      reasoning: 'Hung committed to owning the comms plan and sharing by Tue.',
      confidence: 0.93,
    },
    {
      id: 'p9',
      meetingId: 'm-2026-04-21-exec',
      meetingTitle: 'Exec sync · Planner pilot readiness',
      status: 'unassigned',
      title: 'Decide on success metrics for pilot',
      owner: null,
      ownerConfidence: 0.15,
      due: '2026-04-30',
      priority: 9,
      labels: [4],
      bucket: 'To do',
      sourceTs: '15:40:20',
      reasoning:
        '"We need to pick metrics before launch" — no owner named. Routed to meeting organiser.',
      confidence: 0.76,
      unassignedReason: 'No explicit owner in transcript.',
    },
    {
      id: 'p10',
      meetingId: 'm-2026-04-21-account',
      meetingTitle: 'Account review · Client Northwind',
      status: 'pending',
      title: 'Send Northwind renewed SOW draft',
      owner: 'u4',
      ownerConfidence: 0.95,
      due: '2026-04-26',
      priority: 7,
      labels: [5],
      bucket: 'To do',
      sourceTs: '11:45:18',
      reasoning: 'Priya committed to drafting the SOW by next Monday.',
      confidence: 0.91,
    },
  ],
}

// ============ HEADER STRIP (common to transcript sub-pages) ============
const SectionTabs = ({ active }) => {
  const tabs = [
    { id: 'list', label: 'All meetings' },
    { id: 'detail', label: 'Meeting' },
    { id: 'inbox', label: 'Proposal inbox', badge: 7 },
    { id: 'settings', label: 'Capture settings' },
  ]
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '8px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
      }}
    >
      {tabs.map((t) => (
        <button
          key={t.id}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '5px 10px',
            borderRadius: 6,
            background: active === t.id ? 'rgba(255,255,255,0.05)' : 'transparent',
            border: active === t.id ? '1px solid rgba(255,255,255,0.08)' : '1px solid transparent',
            color: active === t.id ? '#f7f8f8' : '#8a8f98',
            fontSize: 12,
            fontWeight: 510,
            letterSpacing: '-0.01em',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {t.label}
          {t.badge != null && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                padding: '0 5px',
                borderRadius: 3,
                background: 'rgba(245,158,11,0.12)',
                color: '#fbbf24',
              }}
            >
              {t.badge}
            </span>
          )}
        </button>
      ))}
      <div
        style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.08)', margin: '0 6px' }}
      />
      <span style={{ fontSize: 11, color: '#62666d' }}>
        Synced from Microsoft Teams · 2 min ago
      </span>
      <div style={{ flex: 1 }} />
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '3px 8px',
          background: 'rgba(16,185,129,0.06)',
          border: '1px solid rgba(16,185,129,0.2)',
          borderRadius: 6,
          fontSize: 11,
          fontWeight: 510,
          color: '#34d399',
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: '#10b981',
            boxShadow: '0 0 0 3px rgba(16,185,129,0.2)',
          }}
        />
        Agent active
      </span>
    </div>
  )
}

// ============================================================
// 01 · TranscriptsListView — meetings list (hero)
// ============================================================
const TranscriptsListView = () => (
  <PlannerShell
    active="transcripts"
    title="Meetings"
    subtitle="All captured Teams meetings"
    primary={
      <Btn variant="primary" size="md" icon={I.plus}>
        New action
      </Btn>
    }
    secondary={
      <Btn variant="ghost" size="md" icon={I.settings}>
        Capture settings
      </Btn>
    }
  >
    <SectionTabs active="list" />
    <MeetingsFilterBar />
    <MeetingsTable />
  </PlannerShell>
)

const MeetingsFilterBar = () => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '10px 16px',
      borderBottom: '1px solid rgba(255,255,255,0.05)',
    }}
  >
    <FChip label="Range" value="Last 7 days" active />
    <FChip label="Plan" value="Q1 Launch" active />
    <FChip label="Organiser" />
    <FChip label="Status" value="Ready" />
    <button
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '3px 8px',
        borderRadius: 6,
        background: 'transparent',
        border: '1px dashed rgba(255,255,255,0.1)',
        color: '#62666d',
        fontSize: 11,
        cursor: 'pointer',
        fontFamily: 'inherit',
      }}
    >
      {I.plus}
      <span>Filter</span>
    </button>
    <div style={{ flex: 1 }} />
    <span style={{ fontSize: 11, color: '#62666d' }}>24 meetings</span>
    <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.08)' }} />
    <Btn variant="ghost" size="sm" icon={I.sort}>
      Sort
    </Btn>
    <Btn variant="ghost" size="sm" icon={I.search}>
      Search transcripts
    </Btn>
  </div>
)

const MeetingsTable = () => {
  const groups = [
    { day: 'Today', meetings: TRANSCRIPT_DATA.MEETINGS.filter((m) => m.day === 'Today') },
    { day: 'Yesterday', meetings: TRANSCRIPT_DATA.MEETINGS.filter((m) => m.day === 'Yesterday') },
    { day: 'This week', meetings: TRANSCRIPT_DATA.MEETINGS.filter((m) => m.day === 'This week') },
  ]
  return (
    <div style={{ flex: 1, overflow: 'auto' }}>
      {/* column header */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 140px 140px 160px 140px 120px 80px',
          gap: 12,
          padding: '8px 20px',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
          fontSize: 10,
          fontWeight: 510,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: '#62666d',
          position: 'sticky',
          top: 0,
          background: '#08090a',
          zIndex: 1,
        }}
      >
        <span>Meeting</span>
        <span>Status</span>
        <span>Proposals</span>
        <span>Organiser</span>
        <span>Attendees</span>
        <span>When</span>
        <span></span>
      </div>
      {groups.map((g) => (
        <div key={g.day}>
          <div
            style={{
              padding: '14px 20px 6px',
              fontSize: 10,
              fontWeight: 510,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: '#8a8f98',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span>{g.day}</span>
            <span style={{ color: '#62666d' }}>·</span>
            <span style={{ color: '#62666d' }}>{g.meetings.length}</span>
          </div>
          {g.meetings.map((m) => (
            <MeetingTableRow key={m.id} meeting={m} />
          ))}
        </div>
      ))}
    </div>
  )
}

const MeetingTableRow = ({ meeting }) => {
  const organiser = PLANNER_DATA.MEMBERS.find((u) => u.id === meeting.organiser)
  const s = meeting.transcriptStatus
  const statusDot = {
    ready: { color: '#10b981', label: 'Ready' },
    processing: { color: '#f59e0b', label: 'Processing' },
    'opted-out': { color: '#62666d', label: 'Opted out' },
  }[s]
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 140px 140px 160px 140px 120px 80px',
        gap: 12,
        padding: '10px 20px',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        cursor: 'pointer',
        alignItems: 'center',
        background: meeting.active ? 'rgba(113,112,255,0.04)' : 'transparent',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: '#62666d' }}>{I.mail}</span>
          <span
            style={{
              fontSize: 12.5,
              fontWeight: 510,
              color: '#f7f8f8',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {meeting.title}
          </span>
        </div>
        {meeting.series && (
          <div style={{ fontSize: 10, color: '#62666d', marginTop: 2, marginLeft: 22 }}>
            {meeting.series}
          </div>
        )}
      </div>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          fontSize: 11,
          color: statusDot.color,
        }}
      >
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusDot.color }} />
        {statusDot.label}
      </span>
      <span>
        {meeting.pendingCount > 0 ? (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '1px 6px',
              borderRadius: 4,
              background: 'rgba(245,158,11,0.1)',
              color: '#fbbf24',
              fontSize: 11,
              fontWeight: 510,
            }}
          >
            {meeting.pendingCount} to review
          </span>
        ) : meeting.proposalCount > 0 ? (
          <span style={{ fontSize: 11, color: '#8a8f98' }}>{meeting.proposalCount} accepted</span>
        ) : s === 'processing' ? (
          <span style={{ fontSize: 11, color: '#62666d' }}>—</span>
        ) : (
          <span style={{ fontSize: 11, color: '#62666d' }}>none</span>
        )}
      </span>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 11,
          color: '#d0d6e0',
        }}
      >
        <Avatar
          name={organiser.name}
          initials={organiser.initials}
          deptColor={organiser.color}
          size={18}
        />
        {organiser.name}
      </span>
      <AssigneeStack ids={meeting.attendees} max={4} size={20} />
      <span style={{ fontSize: 10, color: '#62666d', fontFamily: 'IBM Plex Mono, monospace' }}>
        {meeting.when.split('·')[1]?.trim() || meeting.duration}
      </span>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <IconBtn title="More">{I.dots}</IconBtn>
      </div>
    </div>
  )
}

// ============================================================
// 02 · TranscriptDetailView — one meeting: transcript + proposals
// ============================================================
const TranscriptDetailView = () => {
  const m = TRANSCRIPT_DATA.MEETINGS.find((x) => x.active)
  const pending = TRANSCRIPT_DATA.PROPOSALS.filter(
    (p) => p.meetingId === m.id && (p.status === 'pending' || p.status === 'unassigned'),
  )
  return (
    <PlannerShell
      active="transcripts"
      title="Meetings"
      subtitle="Q1 Launch · Daily standup"
      primary={
        <Btn variant="primary" size="md" icon={I.sparkle}>
          Re-extract
        </Btn>
      }
      secondary={
        <Btn variant="ghost" size="md" icon={I.download}>
          Export
        </Btn>
      }
    >
      <SectionTabs active="detail" />
      <MeetingHeader meeting={m} />
      <TranscriptActionsStrip pending={pending.length} />
      <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 1fr', flex: 1, minHeight: 0 }}>
        <TranscriptBody />
        <ProposalsPane meetingId={m.id} />
      </div>
    </PlannerShell>
  )
}

const MeetingHeader = ({ meeting }) => {
  const organiser = PLANNER_DATA.MEMBERS.find((u) => u.id === meeting.organiser)
  return (
    <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span
              style={{
                fontSize: 10,
                fontWeight: 510,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: '#62666d',
              }}
            >
              Microsoft Teams · Transcript
            </span>
            {meeting.series && (
              <>
                <span style={{ color: '#3e3e44' }}>·</span>
                <span style={{ fontSize: 10, color: '#62666d' }}>{meeting.series}</span>
              </>
            )}
          </div>
          <h1
            style={{
              margin: 0,
              fontSize: 18,
              fontWeight: 510,
              color: '#f7f8f8',
              letterSpacing: '-0.02em',
              lineHeight: 1.3,
            }}
          >
            {meeting.title}
          </h1>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              marginTop: 8,
              fontSize: 11,
              color: '#8a8f98',
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ color: '#62666d' }}>{I.calendar}</span>
              {meeting.when}
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ color: '#62666d' }}>{I.clock}</span>
              {meeting.duration}
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Avatar
                name={organiser.name}
                initials={organiser.initials}
                deptColor={organiser.color}
                size={16}
              />
              {organiser.name} · organiser
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ color: '#62666d' }}>{I.users}</span>
              {meeting.attendees.length} attendees
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <Btn variant="ghost" size="sm" icon={I.share}>
            Share
          </Btn>
          <IconBtn title="More">{I.dots}</IconBtn>
        </div>
      </div>
    </div>
  )
}

const TranscriptActionsStrip = ({ pending }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '8px 20px',
      background: 'rgba(113,112,255,0.04)',
      borderBottom: '1px solid rgba(113,112,255,0.15)',
    }}
  >
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 11,
        fontWeight: 510,
        color: '#9ea2ff',
      }}
    >
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
        <path
          d="M8 2 9.3 5.5l3.5 1.3-3.5 1.3L8 11.6 6.7 8.1 3.2 6.8l3.5-1.3L8 2z"
          fill="currentColor"
        />
      </svg>
      6 proposals extracted · {pending} awaiting your review
    </span>
    <span style={{ fontSize: 10, color: '#62666d', fontFamily: 'IBM Plex Mono, monospace' }}>
      model: claude-4-opus · 2 min ago
    </span>
    <div style={{ flex: 1 }} />
    <Btn variant="subtle" size="sm" icon={I.sparkle}>
      Re-extract
    </Btn>
    <Btn variant="ghost" size="sm" icon={I.lock}>
      Opt out of future capture
    </Btn>
  </div>
)

const TranscriptBody = () => (
  <div
    style={{
      overflow: 'auto',
      padding: '16px 20px 60px',
      borderRight: '1px solid rgba(255,255,255,0.05)',
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 510,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: '#62666d',
        }}
      >
        Transcript · 17 entries
      </div>
      <div style={{ flex: 1 }} />
      <div
        style={{
          display: 'inline-flex',
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 5,
          padding: 2,
          fontSize: 10,
        }}
      >
        {['All', 'With actions', 'Speakers'].map((l, i) => (
          <button
            key={l}
            style={{
              padding: '3px 8px',
              borderRadius: 3,
              background: i === 0 ? 'rgba(255,255,255,0.06)' : 'transparent',
              color: i === 0 ? '#f7f8f8' : '#8a8f98',
              border: 'none',
              fontSize: 10,
              fontWeight: 510,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {l}
          </button>
        ))}
      </div>
    </div>
    {TRANSCRIPT_DATA.TRANSCRIPT.map((line, i) => (
      <TranscriptLine key={i} line={line} />
    ))}
    <div
      style={{
        marginTop: 20,
        padding: '10px 12px',
        fontSize: 10,
        color: '#62666d',
        background: 'rgba(255,255,255,0.015)',
        border: '1px dashed rgba(255,255,255,0.06)',
        borderRadius: 6,
        lineHeight: 1.5,
      }}
    >
      Transcript provided by Microsoft Teams. Whisper-translated to English from mixed EN/VI audio.
      Microsoft Teams is the source of truth — edits are made in Teams and re-synced here.
    </div>
  </div>
)

const TranscriptLine = ({ line }) => {
  const u = PLANNER_DATA.MEMBERS.find((m) => m.id === line.who)
  const hasProposal = !!line.proposals
  return (
    <div
      style={{
        display: 'flex',
        gap: 10,
        padding: '8px 10px',
        marginBottom: 2,
        borderRadius: 6,
        background: hasProposal ? 'rgba(113,112,255,0.05)' : 'transparent',
        borderLeft: hasProposal ? '2px solid #7170ff' : '2px solid transparent',
      }}
    >
      <span
        style={{
          fontSize: 10,
          fontFamily: 'IBM Plex Mono, monospace',
          color: '#62666d',
          paddingTop: 2,
          width: 56,
          flexShrink: 0,
        }}
      >
        {line.t}
      </span>
      <Avatar name={u.name} initials={u.initials} deptColor={u.color} size={20} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 2 }}>
          <span style={{ fontSize: 11, fontWeight: 510, color: '#f7f8f8' }}>{u.name}</span>
          {hasProposal && (
            <span
              style={{
                fontSize: 9,
                fontWeight: 510,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                color: '#9ea2ff',
                padding: '1px 5px',
                background: 'rgba(113,112,255,0.1)',
                borderRadius: 3,
              }}
            >
              Action detected
            </span>
          )}
        </div>
        <div style={{ fontSize: 12, color: '#d0d6e0', lineHeight: 1.55 }}>{line.text}</div>
      </div>
    </div>
  )
}

const ProposalsPane = ({ meetingId }) => {
  const all = TRANSCRIPT_DATA.PROPOSALS.filter((p) => p.meetingId === meetingId)
  const pending = all.filter((p) => p.status === 'pending' || p.status === 'unassigned')
  const resolved = all.filter((p) => p.status === 'accepted' || p.status === 'rejected')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, background: '#0c0c0e' }}>
      <div
        style={{
          padding: '10px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 510,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: '#62666d',
          }}
        >
          Proposals
        </div>
        <span
          style={{
            fontSize: 10,
            fontFamily: 'IBM Plex Mono, monospace',
            color: '#d0d6e0',
            background: 'rgba(255,255,255,0.05)',
            padding: '0 5px',
            borderRadius: 3,
          }}
        >
          {all.length}
        </span>
        <div style={{ flex: 1 }} />
        <Btn variant="ghost" size="sm">
          Accept all
        </Btn>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: 14 }}>
        <div
          style={{
            fontSize: 10,
            fontWeight: 510,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: '#fbbf24',
            marginBottom: 8,
          }}
        >
          Awaiting review · {pending.length}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
          {pending.map((p) => (
            <ProposalCard key={p.id} proposal={p} />
          ))}
        </div>
        <div
          style={{
            fontSize: 10,
            fontWeight: 510,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: '#62666d',
            marginBottom: 8,
          }}
        >
          Resolved · {resolved.length}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {resolved.map((p) => (
            <ResolvedProposalRow key={p.id} proposal={p} />
          ))}
        </div>
      </div>
    </div>
  )
}

const ProposalCard = ({ proposal, compact }) => {
  const p = proposal
  const owner = p.owner ? PLANNER_DATA.MEMBERS.find((m) => m.id === p.owner) : null
  const unassigned = p.status === 'unassigned'
  const confPct = Math.round(p.confidence * 100)
  const confColor = confPct >= 85 ? '#10b981' : confPct >= 70 ? '#f59e0b' : '#ef4444'
  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.02)',
        border: `1px solid ${unassigned ? 'rgba(245,158,11,0.25)' : 'rgba(255,255,255,0.08)'}`,
        borderRadius: 8,
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '1px 6px',
            fontSize: 10,
            fontWeight: 510,
            color: confColor,
            background: `${confColor}15`,
            borderRadius: 3,
            fontFamily: 'IBM Plex Mono, monospace',
          }}
        >
          <span style={{ width: 4, height: 4, borderRadius: '50%', background: confColor }} />
          {confPct}% confidence
        </span>
        <span style={{ fontSize: 10, fontFamily: 'IBM Plex Mono, monospace', color: '#62666d' }}>
          @ {p.sourceTs}
        </span>
        {compact && <span style={{ fontSize: 10, color: '#8a8f98' }}>· {p.meetingTitle}</span>}
        <div style={{ flex: 1 }} />
        {unassigned && (
          <span
            style={{
              fontSize: 9,
              fontWeight: 510,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              padding: '1px 5px',
              borderRadius: 3,
              background: 'rgba(245,158,11,0.12)',
              color: '#fbbf24',
            }}
          >
            Needs owner
          </span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <span style={{ paddingTop: 2 }}>
          <Priority level={p.priority} />
        </span>
        <div
          style={{
            flex: 1,
            fontSize: 13,
            fontWeight: 510,
            color: '#f7f8f8',
            letterSpacing: '-0.01em',
            lineHeight: 1.4,
          }}
        >
          {p.title}
        </div>
      </div>
      <div
        style={{
          padding: '8px 10px',
          background: 'rgba(113,112,255,0.05)',
          border: '1px solid rgba(113,112,255,0.12)',
          borderRadius: 6,
          fontSize: 11,
          color: '#c9cdff',
          lineHeight: 1.55,
        }}
      >
        <div
          style={{
            fontSize: 9,
            fontWeight: 510,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: '#9ea2ff',
            marginBottom: 3,
          }}
        >
          Why
        </div>
        {p.reasoning}
      </div>
      <div
        style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 10px', fontSize: 11 }}
      >
        <span style={{ color: '#62666d' }}>Owner</span>
        <span>
          {unassigned ? (
            <button
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '2px 8px',
                fontSize: 11,
                fontWeight: 510,
                background: 'rgba(245,158,11,0.1)',
                color: '#fbbf24',
                border: '1px dashed rgba(245,158,11,0.4)',
                borderRadius: 4,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {I.plus} Assign owner
            </button>
          ) : (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <Avatar
                name={owner.name}
                initials={owner.initials}
                deptColor={owner.color}
                size={16}
              />
              <span style={{ color: '#d0d6e0' }}>{owner.name}</span>
              <span style={{ fontSize: 10, color: '#62666d' }}>
                · {Math.round(p.ownerConfidence * 100)}%
              </span>
            </span>
          )}
        </span>
        <span style={{ color: '#62666d' }}>Due</span>
        <span>
          <DueBadge date={p.due} />
        </span>
        <span style={{ color: '#62666d' }}>Bucket</span>
        <span style={{ color: '#d0d6e0' }}>{p.bucket}</span>
        <span style={{ color: '#62666d' }}>Labels</span>
        <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {p.labels.map((s) => (
            <LabelPill key={s} slot={s} />
          ))}
        </span>
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          paddingTop: 4,
          borderTop: '1px solid rgba(255,255,255,0.05)',
          marginTop: 2,
        }}
      >
        <Btn variant="ghost" size="sm" icon={I.edit}>
          Edit
        </Btn>
        <div style={{ flex: 1 }} />
        <Btn variant="ghost" size="sm">
          Reject
        </Btn>
        <Btn variant="primary" size="sm" icon={I.check}>
          {unassigned ? 'Assign & accept' : 'Accept'}
        </Btn>
      </div>
    </div>
  )
}

const ResolvedProposalRow = ({ proposal }) => {
  const p = proposal
  const accepted = p.status === 'accepted'
  const owner = p.owner ? PLANNER_DATA.MEMBERS.find((m) => m.id === p.owner) : null
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '7px 10px',
        background: 'rgba(255,255,255,0.015)',
        border: '1px solid rgba(255,255,255,0.04)',
        borderRadius: 6,
      }}
    >
      <span
        title={accepted ? 'Accepted' : 'Rejected'}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 14,
          height: 14,
          borderRadius: '50%',
          background: accepted ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.12)',
          color: accepted ? '#10b981' : '#ef4444',
        }}
      >
        {accepted ? I.check : I.x}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 510,
            color: accepted ? '#d0d6e0' : '#8a8f98',
            textDecoration: accepted ? 'none' : 'line-through',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {p.title}
        </div>
        <div style={{ fontSize: 10, color: '#62666d', marginTop: 1 }}>
          {accepted ? (
            <>Accepted · assigned to {owner?.name}</>
          ) : (
            <>Rejected · {p.rejectedReason}</>
          )}
        </div>
      </div>
      {accepted && (
        <span style={{ fontSize: 10, color: '#62666d', fontFamily: 'IBM Plex Mono, monospace' }}>
          TASK-{1040 + parseInt(p.id.slice(1))}
        </span>
      )}
    </div>
  )
}

// ============================================================
// 03 · ProposalInboxView — cross-meeting review queue
// ============================================================
const ProposalInboxView = () => {
  const pending = TRANSCRIPT_DATA.PROPOSALS.filter(
    (p) => p.status === 'pending' || p.status === 'unassigned',
  )
  const unassigned = pending.filter((p) => p.status === 'unassigned')
  const byMeeting = pending.reduce((a, p) => {
    ;(a[p.meetingId] = a[p.meetingId] || []).push(p)
    return a
  }, {})
  return (
    <PlannerShell
      active="transcripts"
      title="Meetings"
      subtitle="Proposal inbox"
      primary={
        <Btn variant="primary" size="md" icon={I.check}>
          Accept all high-confidence
        </Btn>
      }
      secondary={
        <Btn variant="ghost" size="md" icon={I.filter}>
          Filter
        </Btn>
      }
    >
      <SectionTabs active="inbox" />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 10,
          padding: '14px 20px',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
        }}
      >
        <StatPill label="Awaiting review" value={pending.length} color="#fbbf24" />
        <StatPill label="Unassigned (need owner)" value={unassigned.length} color="#f59e0b" />
        <StatPill
          label="Meetings with open actions"
          value={Object.keys(byMeeting).length}
          color="#7170ff"
        />
        <StatPill label="Avg confidence" value="86%" color="#10b981" />
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '14px 20px 40px' }}>
        {Object.entries(byMeeting).map(([mid, props]) => {
          const m = TRANSCRIPT_DATA.MEETINGS.find((x) => x.id === mid)
          return (
            <div key={mid} style={{ marginBottom: 22 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 10,
                  padding: '4px 0',
                  borderBottom: '1px solid rgba(255,255,255,0.05)',
                  paddingBottom: 8,
                }}
              >
                <span style={{ color: '#62666d' }}>{I.mail}</span>
                <span style={{ fontSize: 12.5, fontWeight: 510, color: '#f7f8f8' }}>{m.title}</span>
                <span style={{ fontSize: 11, color: '#62666d' }}>· {m.when}</span>
                <div style={{ flex: 1 }} />
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 510,
                    padding: '1px 6px',
                    borderRadius: 3,
                    background: 'rgba(245,158,11,0.1)',
                    color: '#fbbf24',
                  }}
                >
                  {props.length} to review
                </span>
                <Btn variant="ghost" size="sm">
                  Open meeting
                </Btn>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                {props.map((p) => (
                  <ProposalCard key={p.id} proposal={p} compact />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </PlannerShell>
  )
}

const StatPill = ({ label, value, color }) => (
  <div
    style={{
      padding: '10px 12px',
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 8,
      display: 'flex',
      flexDirection: 'column',
      gap: 2,
    }}
  >
    <span
      style={{
        fontSize: 10,
        fontWeight: 510,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: '#62666d',
      }}
    >
      {label}
    </span>
    <span style={{ fontSize: 22, fontWeight: 510, color, letterSpacing: '-0.02em' }}>{value}</span>
  </div>
)

// ============================================================
// 04 · CaptureSettingsView — opt-out & capture scope & audit
// ============================================================
const CaptureSettingsView = () => (
  <PlannerShell
    active="transcripts"
    title="Meetings"
    subtitle="Capture settings"
    primary={
      <Btn variant="primary" size="md" icon={I.check}>
        Save changes
      </Btn>
    }
  >
    <SectionTabs active="settings" />
    <div
      style={{
        padding: '20px 24px',
        display: 'grid',
        gridTemplateColumns: '1fr 320px',
        gap: 24,
        flex: 1,
        minHeight: 0,
        overflow: 'auto',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <SettingsCard
          title="Personal capture"
          description="Apply to meetings where you're the organiser, a required attendee, or a presenter."
        >
          <ToggleRow
            label="Extract actions from all my meetings"
            caption="Recommended · default on"
            on
          />
          <ToggleRow label="Include recurring 1:1s" caption="Applied to 3 series" on={false} />
          <ToggleRow
            label="Include meetings outside the organisation"
            caption="External partners and clients"
            on={false}
          />
          <div
            style={{
              padding: '10px 12px',
              background: 'rgba(245,158,11,0.06)',
              border: '1px solid rgba(245,158,11,0.2)',
              borderRadius: 6,
              fontSize: 11,
              color: '#fbbf24',
              lineHeight: 1.55,
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8,
            }}
          >
            <span style={{ color: '#f59e0b', paddingTop: 2 }}>{I.lock}</span>
            <div style={{ flex: 1 }}>
              <strong style={{ fontWeight: 600 }}>Attendance-based visibility (NFR-13).</strong> You
              will only see extracted actions for meetings you actually attended. Transcripts are
              never shared with people who didn't attend, even via Action Intelligence.
            </div>
          </div>
        </SettingsCard>

        <SettingsCard
          title="Per-series overrides"
          description="Opt specific recurring series out of extraction. Teams is the source of truth for attendance."
        >
          <SeriesRow title="Weekly 1:1 · Ana / Mei" freq="Mondays · 10:00" status="opted-out" />
          <SeriesRow title="Daily standup · Q1 Launch" freq="Mon-Fri · 09:30" status="on" />
          <SeriesRow title="Account review · Northwind" freq="Mondays · 11:00" status="on" />
          <SeriesRow title="Offsite planning · Q3" freq="One-off" status="on" />
          <button
            style={{
              marginTop: 4,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '5px 10px',
              borderRadius: 5,
              background: 'transparent',
              border: '1px dashed rgba(255,255,255,0.12)',
              color: '#8a8f98',
              fontSize: 11,
              fontWeight: 510,
              cursor: 'pointer',
              fontFamily: 'inherit',
              alignSelf: 'flex-start',
            }}
          >
            {I.plus} Add series override
          </button>
        </SettingsCard>

        <SettingsCard
          title="Extraction model"
          description="Used to parse transcripts and generate action proposals. Proposals always require your review before becoming tasks."
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <ModelRadio name="Claude Sonnet 4" desc="Fast · default for standups" on />
            <ModelRadio name="Claude Opus 4" desc="Highest quality · long meetings" on={false} />
          </div>
          <ToggleRow
            label="Run extraction automatically"
            caption="Off · on-demand re-extract only"
            on={false}
          />
          <ToggleRow
            label="Notify me when new proposals land"
            caption="In-app notification to assignee"
            on
          />
        </SettingsCard>
      </div>

      <aside style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <SettingsCard title="Recent capture audit" compact>
          <AuditRow
            action="Extraction run"
            meeting="Q1 Launch · standup"
            when="2 min ago"
            who="System"
          />
          <AuditRow
            action="Opted series out"
            meeting="1:1 · Ana / Mei"
            when="Yesterday"
            who="You"
          />
          <AuditRow
            action="Re-extract requested"
            meeting="Exec sync"
            when="Yesterday"
            who="Hung N."
          />
          <AuditRow
            action="Proposal accepted"
            meeting="Account review"
            when="2d ago"
            who="Priya P."
          />
        </SettingsCard>

        <SettingsCard title="Data retention">
          <div style={{ fontSize: 11, color: '#8a8f98', lineHeight: 1.55, marginBottom: 8 }}>
            Transcripts are retained by Microsoft Teams under your organisation's policy. Planner
            stores only the extracted action proposals and your review history.
          </div>
          <div
            style={{
              fontSize: 10,
              fontFamily: 'IBM Plex Mono, monospace',
              color: '#62666d',
              padding: '6px 8px',
              background: 'rgba(255,255,255,0.02)',
              borderRadius: 4,
            }}
          >
            Proposal history · 90 days
            <br />
            Audit log · 18 months
          </div>
        </SettingsCard>
      </aside>
    </div>
  </PlannerShell>
)

const SettingsCard = ({ title, description, children, compact }) => (
  <section
    style={{
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 8,
    }}
  >
    <header
      style={{
        padding: compact ? '10px 14px' : '12px 16px 10px',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
      }}
    >
      <h3
        style={{
          margin: 0,
          fontSize: 12.5,
          fontWeight: 510,
          color: '#f7f8f8',
          letterSpacing: '-0.01em',
        }}
      >
        {title}
      </h3>
      {description && (
        <p style={{ margin: '3px 0 0', fontSize: 11, color: '#8a8f98', lineHeight: 1.5 }}>
          {description}
        </p>
      )}
    </header>
    <div
      style={{
        padding: compact ? '6px 4px' : 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      {children}
    </div>
  </section>
)

const ToggleRow = ({ label, caption, on }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '2px 0' }}>
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 12, fontWeight: 510, color: '#f7f8f8' }}>{label}</div>
      {caption && <div style={{ fontSize: 10.5, color: '#62666d', marginTop: 1 }}>{caption}</div>}
    </div>
    <div
      style={{
        width: 28,
        height: 16,
        borderRadius: 8,
        padding: 2,
        background: on ? '#7170ff' : 'rgba(255,255,255,0.1)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: on ? 'flex-end' : 'flex-start',
      }}
    >
      <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#fff' }} />
    </div>
  </div>
)

const SeriesRow = ({ title, freq, status }) => {
  const optedOut = status === 'opted-out'
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '7px 8px',
        borderRadius: 5,
        background: 'rgba(255,255,255,0.015)',
      }}
    >
      <span style={{ color: '#62666d' }}>{I.calendar}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 510, color: '#f7f8f8' }}>{title}</div>
        <div style={{ fontSize: 10, color: '#62666d', marginTop: 1 }}>{freq}</div>
      </div>
      <span
        style={{
          fontSize: 10,
          fontWeight: 510,
          padding: '2px 7px',
          borderRadius: 3,
          background: optedOut ? 'rgba(255,255,255,0.04)' : 'rgba(16,185,129,0.1)',
          color: optedOut ? '#8a8f98' : '#34d399',
        }}
      >
        {optedOut ? 'Opted out' : 'Capturing'}
      </span>
      <IconBtn title="More">{I.dots}</IconBtn>
    </div>
  )
}

const ModelRadio = ({ name, desc, on }) => (
  <div
    style={{
      padding: '10px 12px',
      borderRadius: 6,
      background: on ? 'rgba(113,112,255,0.06)' : 'rgba(255,255,255,0.015)',
      border: `1px solid ${on ? 'rgba(113,112,255,0.3)' : 'rgba(255,255,255,0.06)'}`,
      cursor: 'pointer',
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span
        style={{
          width: 12,
          height: 12,
          borderRadius: '50%',
          border: `1.5px solid ${on ? '#7170ff' : '#62666d'}`,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {on && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#7170ff' }} />}
      </span>
      <span style={{ fontSize: 12, fontWeight: 510, color: on ? '#f7f8f8' : '#d0d6e0' }}>
        {name}
      </span>
    </div>
    <div style={{ fontSize: 10.5, color: '#62666d', marginTop: 4, marginLeft: 18 }}>{desc}</div>
  </div>
)

const AuditRow = ({ action, meeting, when, who }) => (
  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '7px 10px' }}>
    <span
      style={{ width: 5, height: 5, borderRadius: '50%', background: '#7170ff', marginTop: 7 }}
    />
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 11, color: '#d0d6e0' }}>
        <span style={{ fontWeight: 510, color: '#f7f8f8' }}>{action}</span>
        <span style={{ color: '#62666d' }}> · </span>
        {meeting}
      </div>
      <div style={{ fontSize: 10, color: '#62666d', marginTop: 1 }}>
        {who} · {when}
      </div>
    </div>
  </div>
)

// Keep the legacy export name so the canvas keeps rendering while we migrate.
const TranscriptsView = TranscriptsListView

Object.assign(window, {
  TRANSCRIPT_DATA,
  TranscriptsView,
  TranscriptsListView,
  TranscriptDetailView,
  ProposalInboxView,
  CaptureSettingsView,
})
