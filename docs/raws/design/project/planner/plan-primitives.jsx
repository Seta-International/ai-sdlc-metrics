// Planner-specific primitives built on top of the shared ones.

// Priority: urgent (9) · important (5) · normal (3) · low (1)
const Priority = ({ level, size = 12 }) => {
  if (!level || level === 3) {
    return (
      <span
        title="Normal"
        style={{
          display: 'inline-flex',
          width: size,
          height: size,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <svg width={size} height={size} viewBox="0 0 12 12" fill="none">
          <path d="M2 6h8" stroke="#8a8f98" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </span>
    )
  }
  if (level === 1) {
    return (
      <span title="Low" style={{ display: 'inline-flex', width: size, height: size }}>
        <svg width={size} height={size} viewBox="0 0 12 12" fill="none">
          <rect x="1.5" y="7" width="2" height="3.5" rx="0.5" fill="#62666d" />
          <rect x="5" y="5" width="2" height="5.5" rx="0.5" fill="#62666d" />
          <rect x="8.5" y="3" width="2" height="7.5" rx="0.5" fill="rgba(138,143,152,0.25)" />
        </svg>
      </span>
    )
  }
  if (level === 5) {
    return (
      <span title="Important" style={{ display: 'inline-flex', width: size, height: size }}>
        <svg width={size} height={size} viewBox="0 0 12 12" fill="none">
          <rect x="1.5" y="7" width="2" height="3.5" rx="0.5" fill="#d0d6e0" />
          <rect x="5" y="5" width="2" height="5.5" rx="0.5" fill="#d0d6e0" />
          <rect x="8.5" y="3" width="2" height="7.5" rx="0.5" fill="#d0d6e0" />
        </svg>
      </span>
    )
  }
  // urgent
  return (
    <span
      title="Urgent"
      style={{
        display: 'inline-flex',
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <svg width={size} height={size} viewBox="0 0 12 12" fill="none">
        <rect x="1" y="1" width="10" height="10" rx="2" fill="#f59e0b" />
        <path d="M6 3v3.5M6 8.2v.6" stroke="#0a0a0b" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    </span>
  )
}

// Progress: 0 (empty circle) · 50 (half) · 100 (check)
const Progress = ({ value, size = 14 }) => {
  const v = value || 0
  if (v === 100) {
    return (
      <span style={{ display: 'inline-flex', width: size, height: size }}>
        <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
          <circle cx="7" cy="7" r="6" fill="#10b981" />
          <path
            d="M4 7.2l2 2 4-4.2"
            stroke="#0a0a0b"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    )
  }
  if (v === 50) {
    return (
      <span style={{ display: 'inline-flex', width: size, height: size }}>
        <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
          <circle cx="7" cy="7" r="6" stroke="#f59e0b" strokeWidth="1.5" />
          <path d="M7 1a6 6 0 0 1 0 12z" fill="#f59e0b" />
        </svg>
      </span>
    )
  }
  return (
    <span style={{ display: 'inline-flex', width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
        <circle cx="7" cy="7" r="6" stroke="#62666d" strokeWidth="1.5" strokeDasharray="2 2" />
      </svg>
    </span>
  )
}

// Label pill — tinted by slot color
const LabelPill = ({ slot }) => {
  const def = PLANNER_DATA.LABELS.find((l) => l.slot === slot)
  if (!def) return null
  const c = def.color
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '1px 7px',
        borderRadius: 9999,
        background: `${c}22`,
        color: c,
        border: `1px solid ${c}44`,
        fontSize: 10,
        fontWeight: 510,
        letterSpacing: '-0.01em',
        lineHeight: 1.5,
      }}
    >
      {def.name}
    </span>
  )
}

// Due badge — overdue (red), today (amber), future (muted)
const DueBadge = ({ date, today = '2026-04-22' }) => {
  if (!date) return null
  const d = new Date(date)
  const t = new Date(today)
  const diff = Math.round((d - t) / 86400000)
  let state = 'future',
    label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  if (diff < 0) state = 'overdue'
  else if (diff === 0) {
    state = 'today'
    label = 'Today'
  } else if (diff === 1) label = 'Tomorrow'
  const colors = {
    overdue: { bg: 'rgba(239,68,68,0.1)', fg: '#f87171' },
    today: { bg: 'rgba(245,158,11,0.1)', fg: '#fbbf24' },
    future: { bg: 'transparent', fg: '#8a8f98' },
  }[state]
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        padding: '1px 5px',
        borderRadius: 4,
        background: colors.bg,
        color: colors.fg,
        fontSize: 10,
        fontWeight: 510,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
        <rect x="1.5" y="2.5" width="9" height="8" rx="1" stroke="currentColor" strokeWidth="1.2" />
        <path
          d="M1.5 5h9M4 1.5v2M8 1.5v2"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
      </svg>
      {label}
    </span>
  )
}

const AssigneeStack = ({ ids = [], max = 3, size = 18 }) => {
  const list = ids.map((id) => PLANNER_DATA.MEMBERS.find((m) => m.id === id)).filter(Boolean)
  const shown = list.slice(0, max)
  const rest = list.length - shown.length
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center' }}>
      {shown.map((m, i) => (
        <span
          key={m.id}
          style={{
            marginLeft: i === 0 ? 0 : -5,
            position: 'relative',
            zIndex: shown.length - i,
            borderRadius: '50%',
            boxShadow: '0 0 0 1.5px #08090a',
          }}
        >
          <Avatar name={m.name} initials={m.initials} deptColor={m.color} size={size} />
        </span>
      ))}
      {rest > 0 && (
        <span
          style={{
            marginLeft: -5,
            width: size,
            height: size,
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.05)',
            color: '#d0d6e0',
            fontSize: 9,
            fontWeight: 510,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 0 1.5px #08090a',
          }}
        >
          +{rest}
        </span>
      )}
    </span>
  )
}

// Tiny inline svgs specific to planner
const PI = {
  comment: (
    <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
      <path
        d="M2 3.5A1.5 1.5 0 0 1 3.5 2h5A1.5 1.5 0 0 1 10 3.5v3A1.5 1.5 0 0 1 8.5 8H5l-3 2.5V3.5z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  ),
  paperclip: (
    <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
      <path
        d="M8 3.5l-4 4a1.5 1.5 0 0 0 2.12 2.12L10.12 5.6a2.5 2.5 0 0 0-3.54-3.54L2.88 5.76"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  checklist: (
    <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
      <rect x="1.5" y="1.5" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M3.5 6l1.5 1.5L8 4.5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  grip: (
    <svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor">
      <circle cx="4" cy="3" r="1" />
      <circle cx="4" cy="6" r="1" />
      <circle cx="4" cy="9" r="1" />
      <circle cx="8" cy="3" r="1" />
      <circle cx="8" cy="6" r="1" />
      <circle cx="8" cy="9" r="1" />
    </svg>
  ),
  shield: (
    <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
      <path
        d="M6 1.5 2.5 3v3.5c0 2 1.5 3.5 3.5 4 2-.5 3.5-2 3.5-4V3L6 1.5z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  ),
  sun: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M8 2v1.5M8 12.5V14M2 8h1.5M12.5 8H14M3.5 3.5l1 1M11.5 11.5l1 1M3.5 12.5l1-1M11.5 4.5l1-1"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  ),
  listChecks: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path
        d="M3 5l1.5 1.5L7 4M3 11l1.5 1.5L7 10M9 5h5M9 11h5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  folder: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path
        d="M2 4.5A1.5 1.5 0 0 1 3.5 3H6l1.5 1.5h5A1.5 1.5 0 0 1 14 6v5.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 11.5v-7z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  ),
  kanban: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="2.5" width="3.5" height="11" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect
        x="6.25"
        y="2.5"
        width="3.5"
        height="7"
        rx="1"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <rect
        x="10.5"
        y="2.5"
        width="3.5"
        height="9"
        rx="1"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  ),
  table: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="2.5" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M2 6.5h12M2 10h12M6 6.5v7" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  schedule: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="3" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M2 6.5h12M5.5 2v3M10.5 2v3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  ),
  pie: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path
        d="M8 2v6l4.5 4.5A6 6 0 1 1 8 2z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  ),
}

Object.assign(window, {
  Priority,
  Progress,
  LabelPill: LabelPill,
  PLabelPill: LabelPill,
  DueBadge,
  AssigneeStack,
  PI,
})
