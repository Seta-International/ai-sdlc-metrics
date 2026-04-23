// Shared primitives: Avatar, StatusPill, IconButton, Sparkline, etc.
// All components exported to window for Babel-scope sharing.

const Avatar = ({ name, initials, deptColor = '#5e6ad2', size = 24, src }) => {
  // derive subtle gradient from deptColor
  const bg = `linear-gradient(135deg, ${deptColor}44, ${deptColor}22)`
  return (
    <div
      style={{
        width: size,
        height: size,
        background: bg,
        border: `1px solid ${deptColor}55`,
        borderRadius: '50%',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#f7f8f8',
        fontSize: size < 28 ? 10 : size < 40 ? 12 : size < 60 ? 16 : 22,
        fontWeight: 510,
        letterSpacing: '-0.02em',
        flexShrink: 0,
        overflow: 'hidden',
      }}
      title={name}
    >
      {src ? (
        <img src={src} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        initials ||
        (name || '')
          .split(' ')
          .map((n) => n[0])
          .slice(0, 2)
          .join('')
      )}
    </div>
  )
}

const StatusPill = ({ status, size = 'md' }) => {
  const map = {
    Active: { dot: '#10b981', text: '#d0d6e0' },
    Probation: { dot: '#f59e0b', text: '#d0d6e0' },
    'On leave': { dot: '#8a8f98', text: '#8a8f98' },
    'Pending start': { dot: '#7170ff', text: '#d0d6e0' },
    Offboarding: { dot: '#ef4444', text: '#d0d6e0' },
    Terminated: { dot: '#62666d', text: '#62666d' },
  }
  const s = map[status] || map.Active
  const fs = size === 'sm' ? 11 : 12
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: fs,
        fontWeight: 510,
        color: s.text,
        letterSpacing: '-0.01em',
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          background: s.dot,
          borderRadius: '50%',
          boxShadow: `0 0 0 3px ${s.dot}15`,
        }}
      />
      {status}
    </span>
  )
}

const Pill = ({ children, variant = 'default', icon }) => {
  const styles = {
    default: { bg: 'transparent', border: 'rgba(255,255,255,0.08)', color: '#d0d6e0' },
    solid: { bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.08)', color: '#f7f8f8' },
    accent: { bg: 'rgba(113,112,255,0.08)', border: 'rgba(113,112,255,0.25)', color: '#9ea2ff' },
    success: { bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.25)', color: '#34d399' },
    warning: { bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.25)', color: '#fbbf24' },
  }
  const s = styles[variant] || styles.default
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 8px',
        borderRadius: 9999,
        background: s.bg,
        border: `1px solid ${s.border}`,
        color: s.color,
        fontSize: 11,
        fontWeight: 510,
        letterSpacing: '-0.01em',
        lineHeight: 1.4,
      }}
    >
      {icon && <span style={{ display: 'inline-flex' }}>{icon}</span>}
      {children}
    </span>
  )
}

const Kbd = ({ children }) => (
  <span
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 18,
      height: 18,
      padding: '0 5px',
      background: 'rgba(255,255,255,0.05)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 4,
      fontFamily: 'IBM Plex Mono, ui-monospace, monospace',
      fontSize: 10,
      fontWeight: 510,
      color: '#8a8f98',
    }}
  >
    {children}
  </span>
)

const IconBtn = ({ children, onClick, active, title, size = 28 }) => (
  <button
    onClick={onClick}
    title={title}
    style={{
      width: size,
      height: size,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: active ? 'rgba(255,255,255,0.06)' : 'transparent',
      border: `1px solid ${active ? 'rgba(255,255,255,0.1)' : 'transparent'}`,
      borderRadius: 6,
      color: active ? '#f7f8f8' : '#8a8f98',
      cursor: 'pointer',
      transition: 'all 120ms',
    }}
    onMouseEnter={(e) => {
      if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.03)'
    }}
    onMouseLeave={(e) => {
      if (!active) e.currentTarget.style.background = 'transparent'
    }}
  >
    {children}
  </button>
)

const Btn = ({ children, variant = 'ghost', size = 'md', icon, onClick }) => {
  const variants = {
    ghost: {
      bg: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.08)',
      color: '#e2e4e7',
    },
    primary: { bg: '#5e6ad2', border: '1px solid #5e6ad2', color: '#fff' },
    subtle: { bg: 'rgba(255,255,255,0.04)', border: '1px solid transparent', color: '#d0d6e0' },
    danger: {
      bg: 'rgba(239,68,68,0.08)',
      border: '1px solid rgba(239,68,68,0.25)',
      color: '#f87171',
    },
  }
  const sizes = {
    sm: { padding: '4px 8px', fontSize: 12, height: 24 },
    md: { padding: '5px 10px', fontSize: 12, height: 28 },
    lg: { padding: '8px 14px', fontSize: 13, height: 34 },
  }
  const v = variants[variant]
  const sz = sizes[size]
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: sz.padding,
        height: sz.height,
        background: v.bg,
        border: v.border,
        color: v.color,
        borderRadius: 6,
        fontSize: sz.fontSize,
        fontWeight: 510,
        letterSpacing: '-0.01em',
        cursor: 'pointer',
        lineHeight: 1,
        fontFamily: 'inherit',
        transition: 'all 120ms',
      }}
    >
      {icon && <span style={{ display: 'inline-flex' }}>{icon}</span>}
      {children}
    </button>
  )
}

// Tiny inline icons (12-14px) — hand-rolled SVG paths
const I = {
  search: (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
      <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
      <path d="m11 11 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  plus: (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
      <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  filter: (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
      <path
        d="M2 3h12l-4.5 6v5l-3-1.5V9L2 3z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  ),
  sort: (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
      <path
        d="M4 3v10m0 0-2-2m2 2 2-2M12 13V3m0 0-2 2m2-2 2 2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  columns: (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="3" width="4" height="10" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="7" y="3" width="3" height="10" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="11" y="3" width="3" height="10" rx="1" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  grid: (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="9" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="2" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="9" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  list: (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
      <path
        d="M2 4h12M2 8h12M2 12h12"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  ),
  chevR: (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
      <path d="m6 3 5 5-5 5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  ),
  chevD: (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
      <path d="m3 6 5 5 5-5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  ),
  dots: (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
      <circle cx="3" cy="8" r="1.4" />
      <circle cx="8" cy="8" r="1.4" />
      <circle cx="13" cy="8" r="1.4" />
    </svg>
  ),
  check: (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
      <path
        d="m3 8 3.5 3.5L13 4.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  x: (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
      <path
        d="M3 3l10 10M13 3 3 13"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  ),
  arrowUp: (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
      <path
        d="M8 13V3m0 0L4 7m4-4 4 4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  arrowDown: (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
      <path
        d="M8 3v10m0 0 4-4m-4 4-4-4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  users: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <circle cx="6" cy="6" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M2 13c0-2 1.8-3.5 4-3.5s4 1.5 4 3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path d="M11 6a2 2 0 1 0 0-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path
        d="M14 12c0-1.5-1-2.5-2.5-2.8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  ),
  clock: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 4.5V8l2.5 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  shield: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path
        d="M8 2 3 4v5c0 3 2 4.5 5 5 3-.5 5-2 5-5V4L8 2z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  ),
  star: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path
        d="m8 2.5 1.8 3.7 4 .6-2.9 2.8.7 4L8 11.8l-3.6 1.9.7-4-2.9-2.8 4-.6L8 2.5z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  ),
  sparkle: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path
        d="M8 2v3M8 11v3M2 8h3M11 8h3M4 4l1.5 1.5M10.5 10.5 12 12M4 12l1.5-1.5M10.5 5.5 12 4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  ),
  plane: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path
        d="m2 9 12-5-3 10-3-4-6-1z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  ),
  userCheck: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <circle cx="6" cy="5.5" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M2 13c0-2 1.8-3.5 4-3.5s4 1.5 4 3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="m10.5 9 1.5 1.5 3-3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  network: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="3" r="1.5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="3" cy="12" r="1.5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="13" cy="12" r="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M8 4.5v3m0 0-4 3m4-3 4 3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  ),
  settings: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M8 2v1.5M8 12.5V14M2 8h1.5M12.5 8H14M3.5 3.5l1 1M11.5 11.5l1 1M3.5 12.5l1-1M11.5 4.5l1-1"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  ),
  chart: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path
        d="M3 13V9M7 13V5M11 13V7"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <path d="M2 13h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  userPlus: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <circle cx="6" cy="5.5" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M2 13c0-2 1.8-3.5 4-3.5s4 1.5 4 3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path d="M13 6v4M11 8h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  userMinus: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <circle cx="6" cy="5.5" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M2 13c0-2 1.8-3.5 4-3.5s4 1.5 4 3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path d="M11 8h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  fileCheck: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M4 2h5l3 3v9H4V2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path
        d="m6 10 1.5 1.5L11 8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  mail: (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="3.5" width="12" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="m2.5 4.5 5.5 4 5.5-4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  ),
  phone: (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
      <path
        d="M3 3c0 5.5 4.5 10 10 10l1.5-2-3-1.5-1.5 1.5c-1.5-.5-3-2-3.5-3.5L8 6 6.5 3 4.5 4.5 3 3z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  ),
  mapPin: (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
      <path
        d="M8 14s5-4 5-8a5 5 0 0 0-10 0c0 4 5 8 5 8z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="6" r="1.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  calendar: (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="3.5" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M2 6.5h12M5.5 2v3M10.5 2v3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  ),
  building: (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
      <path
        d="M3 14V4l5-2v12M13 14V7l-5-3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M5 6.5h1M5 9h1M5 11.5h1M10 9h1M10 11.5h1"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  ),
  edit: (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
      <path
        d="M10.5 2.5 13.5 5.5 6 13l-3.5.5L3 10 10.5 2.5z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  ),
  share: (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
      <circle cx="4" cy="8" r="1.5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="12" cy="4" r="1.5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="m5.5 7 5-2m-5 4 5 2" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  slash: (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
      <path d="m4 13 8-10" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  ),
  home: (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
      <path
        d="m2 8 6-5 6 5v6H2V8z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  ),
  download: (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
      <path
        d="M8 2v8m0 0L5 7m3 3 3-3M2.5 13h11"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  lock: (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
      <rect x="3" y="7" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5 7V5a3 3 0 0 1 6 0v2" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  tag: (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
      <path
        d="m2 8 6-6h5v5l-6 6-5-5z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="6" r="1" fill="currentColor" />
    </svg>
  ),
  bell: (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
      <path
        d="M4 11V7a4 4 0 0 1 8 0v4l1 1.5H3L4 11zM6.5 13.5a1.5 1.5 0 0 0 3 0"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  command: (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
      <path d="M4 4h8v8H4V4z" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M4 4a2 2 0 1 1-2 2h2M12 4a2 2 0 1 0 2 2h-2M4 12a2 2 0 1 0-2-2h2M12 12a2 2 0 1 1 2-2h-2"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  ),
  info: (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 7v4M8 5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  alert: (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
      <path d="M8 2 14 13H2L8 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M8 6.5v3M8 11.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
}

Object.assign(window, { Avatar, StatusPill, Pill, Kbd, IconBtn, Btn, I })
