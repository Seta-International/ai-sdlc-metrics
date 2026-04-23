// App shell: sidebar nav + top bar + app switcher + theme + notifications
const APPS = [
  {
    id: 'people',
    label: 'People',
    color: '#7170ff',
    letter: 'P',
    sub: 'HR · directory · workflows',
    active: true,
  },
  { id: 'finance', label: 'Finance', color: '#10b981', letter: 'F', sub: 'Invoices · budgets' },
  { id: 'projects', label: 'Projects', color: '#06b6d4', letter: 'R', sub: 'Plans · timelines' },
  { id: 'assets', label: 'Assets', color: '#f59e0b', letter: 'A', sub: 'Equipment · licenses' },
  { id: 'inbox', label: 'Inbox', color: '#ec4899', letter: 'I', sub: 'Tasks · approvals' },
  { id: 'docs', label: 'Docs', color: '#8b5cf6', letter: 'D', sub: 'Policies · handbook' },
]

const NOTIFS = [
  {
    id: 1,
    who: 'Diego Ribeiro',
    action: 'submitted a change request',
    detail: 'Title change: Senior → Staff Engineer',
    time: '2m',
    unread: true,
    kind: 'change',
  },
  {
    id: 2,
    who: 'Mei Chen',
    action: 'approved onboarding step',
    detail: 'Equipment assignment for Priya Patel',
    time: '14m',
    unread: true,
    kind: 'approve',
  },
  {
    id: 3,
    who: 'System',
    action: '3 probations ending soon',
    detail: 'Review required by Nov 12',
    time: '1h',
    unread: true,
    kind: 'alert',
  },
  {
    id: 4,
    who: 'Ana Silva',
    action: 'added a new policy',
    detail: 'Remote work — EU update',
    time: '3h',
    unread: false,
    kind: 'doc',
  },
  {
    id: 5,
    who: 'Kai Tanaka',
    action: 'completed profile',
    detail: 'Tax documents uploaded',
    time: '1d',
    unread: false,
    kind: 'profile',
  },
]

const AppShell = ({
  active = 'directory',
  children,
  title,
  subtitle,
  primary,
  secondary,
  density = 'compact',
}) => {
  const [appOpen, setAppOpen] = React.useState(false)
  const [notifOpen, setNotifOpen] = React.useState(false)
  const [theme, setTheme] = React.useState('dark')

  const T =
    theme === 'dark'
      ? {
          bg: '#08090a',
          panel: '#0f1011',
          panel2: '#191a1b',
          text: '#f7f8f8',
          text2: '#d0d6e0',
          text3: '#8a8f98',
          text4: '#62666d',
          border: 'rgba(255,255,255,0.05)',
          border2: 'rgba(255,255,255,0.08)',
          hover: 'rgba(255,255,255,0.05)',
          accentBg: 'rgba(113,112,255,0.08)',
        }
      : {
          bg: '#f7f7f5',
          panel: '#ffffff',
          panel2: '#ffffff',
          text: '#18181b',
          text2: '#3f3f46',
          text3: '#71717a',
          text4: '#a1a1aa',
          border: 'rgba(0,0,0,0.06)',
          border2: 'rgba(0,0,0,0.1)',
          hover: 'rgba(0,0,0,0.04)',
          accentBg: 'rgba(113,112,255,0.08)',
        }

  // Expose the active theme colors to descendants via CSS variables so
  // child views (Directory rows, etc) don't hard-code dark-theme hex.
  React.useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--pm-bg', T.bg)
    root.style.setProperty('--pm-panel', T.panel)
    root.style.setProperty('--pm-panel2', T.panel2)
    root.style.setProperty('--pm-text', T.text)
    root.style.setProperty('--pm-text2', T.text2)
    root.style.setProperty('--pm-text3', T.text3)
    root.style.setProperty('--pm-text4', T.text4)
    root.style.setProperty('--pm-border', T.border)
    root.style.setProperty('--pm-border2', T.border2)
    root.style.setProperty('--pm-hover', T.hover)
  }, [theme])

  const navItems = [
    { id: 'directory', label: 'Directory', icon: I.users, count: 247 },
    { id: 'org', label: 'Org chart', icon: I.network },
    { id: 'onboarding', label: 'Onboarding', icon: I.userPlus, count: 4 },
    { id: 'offboarding', label: 'Offboarding', icon: I.userMinus, count: 2 },
    { id: 'changes', label: 'Change requests', icon: I.fileCheck, count: 5, urgent: true },
    { id: 'reports', label: 'Reports', icon: I.chart },
    { id: 'settings', label: 'Settings', icon: I.settings },
  ]

  const unreadCount = NOTIFS.filter((n) => n.unread).length

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '220px 1fr',
        height: '100%',
        background: T.bg,
        color: T.text,
        position: 'relative',
        fontFamily: 'Inter, -apple-system, system-ui, sans-serif',
        fontFeatureSettings: '"cv01","ss03"',
      }}
    >
      <aside
        style={{
          background: T.panel,
          borderRight: `1px solid ${T.border}`,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* App switcher */}
        <div
          style={{
            padding: '10px 12px',
            borderBottom: `1px solid ${T.border}`,
            position: 'relative',
          }}
        >
          <button
            onClick={() => setAppOpen((v) => !v)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '4px 6px',
              borderRadius: 6,
              background: appOpen ? T.hover : 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: 5,
                background: 'linear-gradient(135deg, #5e6ad2, #7170ff)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontSize: 11,
                fontWeight: 590,
              }}
            >
              P
            </div>
            <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
              <div style={{ fontSize: 12, fontWeight: 510, color: T.text }}>People</div>
              <div style={{ fontSize: 10, color: T.text4 }}>SETA International</div>
            </div>
            <span style={{ color: T.text4, display: 'inline-flex' }}>{I.grid || I.chevD}</span>
          </button>
          {appOpen && (
            <div
              style={{
                position: 'absolute',
                top: 48,
                left: 8,
                right: 8,
                zIndex: 50,
                background: T.panel2,
                border: `1px solid ${T.border2}`,
                borderRadius: 10,
                boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  padding: '10px 12px 6px',
                  fontSize: 10,
                  fontWeight: 510,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: T.text4,
                }}
              >
                Switch app
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: 4,
                  padding: '0 8px 8px',
                }}
              >
                {APPS.map((a) => (
                  <div
                    key={a.id}
                    title={a.label}
                    style={{
                      padding: '10px 6px',
                      borderRadius: 8,
                      textAlign: 'center',
                      background: a.active ? T.accentBg : 'transparent',
                      border: a.active
                        ? '1px solid rgba(113,112,255,0.2)'
                        : '1px solid transparent',
                      cursor: 'pointer',
                    }}
                  >
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 7,
                        margin: '0 auto 6px',
                        background: `linear-gradient(135deg, ${a.color}, ${a.color}aa)`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#fff',
                        fontSize: 12,
                        fontWeight: 590,
                      }}
                    >
                      {a.letter}
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 510,
                        color: a.active ? '#9ea2ff' : T.text2,
                      }}
                    >
                      {a.label}
                    </div>
                  </div>
                ))}
              </div>
              <div
                style={{
                  borderTop: `1px solid ${T.border}`,
                  padding: 8,
                  fontSize: 11,
                  color: T.text3,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span style={{ color: T.text4 }}>{I.plus}</span>
                <span>Add app…</span>
                <div style={{ flex: 1 }} />
                <Kbd>⌘⇧O</Kbd>
              </div>
            </div>
          )}
        </div>

        <div style={{ padding: '8px 10px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '5px 8px',
              height: 28,
              background: theme === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.03)',
              border: `1px solid ${T.border}`,
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            <span style={{ color: T.text4 }}>{I.search}</span>
            <span style={{ flex: 1, fontSize: 12, color: T.text4 }}>Search people…</span>
            <Kbd>⌘K</Kbd>
          </div>
        </div>

        <nav style={{ flex: 1, padding: '4px 6px', overflow: 'auto' }}>
          <SidebarGroup label="People" color={T.text4}>
            {navItems.slice(0, 2).map((n) => (
              <NavItem key={n.id} {...n} active={active === n.id} T={T} />
            ))}
          </SidebarGroup>
          <SidebarGroup label="Workflows" color={T.text4}>
            {navItems.slice(2, 5).map((n) => (
              <NavItem key={n.id} {...n} active={active === n.id} T={T} />
            ))}
          </SidebarGroup>
          <SidebarGroup label="Insights" color={T.text4}>
            {navItems.slice(5, 7).map((n) => (
              <NavItem key={n.id} {...n} active={active === n.id} T={T} />
            ))}
          </SidebarGroup>

          <div
            style={{
              padding: '14px 8px 4px',
              fontSize: 10,
              fontWeight: 510,
              color: T.text4,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}
          >
            Saved views
          </div>
          {PeopleData.SAVED_VIEWS.slice(1, 5).map((v) => (
            <div
              key={v.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '5px 8px',
                borderRadius: 5,
                fontSize: 12,
                color: T.text3,
                cursor: 'pointer',
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 2,
                  background: ['#7170ff', '#f59e0b', '#10b981', '#06b6d4'][v.id.length % 4],
                }}
              />
              <span style={{ flex: 1 }}>{v.name}</span>
              <span style={{ fontSize: 10, color: T.text4 }}>{v.count}</span>
            </div>
          ))}
        </nav>

        <div style={{ padding: 10, borderTop: `1px solid ${T.border}` }}>
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 4, borderRadius: 6 }}
          >
            <Avatar name="You" initials="YO" deptColor="#7170ff" size={24} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 510, color: T.text2 }}>You</div>
              <div style={{ fontSize: 10, color: T.text4 }}>People Ops Lead</div>
            </div>
            <span style={{ color: T.text4 }}>{I.dots}</span>
          </div>
        </div>
      </aside>

      <main style={{ display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
        <header
          style={{
            height: 44,
            borderBottom: `1px solid ${T.border}`,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '0 16px',
            background: theme === 'dark' ? 'rgba(15,16,17,0.6)' : 'rgba(255,255,255,0.8)',
            position: 'relative',
          }}
        >
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: T.text3 }}
          >
            <span style={{ color: T.text4 }}>{I.home}</span>
            <span>{I.slash}</span>
            <span>People</span>
            {subtitle && (
              <>
                <span>{I.slash}</span>
                <span style={{ color: T.text2 }}>{subtitle}</span>
              </>
            )}
          </div>
          <div style={{ flex: 1 }} />

          {/* Theme toggle */}
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            title="Toggle theme"
            style={{
              width: 28,
              height: 28,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'transparent',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              color: T.text3,
            }}
          >
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>

          {/* Notifications */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setNotifOpen((v) => !v)}
              title="Notifications"
              style={{
                width: 28,
                height: 28,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: notifOpen ? T.hover : 'transparent',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                color: T.text3,
                position: 'relative',
              }}
            >
              {I.bell}
              {unreadCount > 0 && (
                <span
                  style={{
                    position: 'absolute',
                    top: 4,
                    right: 4,
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: '#ef4444',
                    border: `1.5px solid ${theme === 'dark' ? '#0f1011' : '#ffffff'}`,
                  }}
                />
              )}
            </button>
            {notifOpen && <NotifPanel T={T} notifs={NOTIFS} onClose={() => setNotifOpen(false)} />}
          </div>

          <IconBtn title="Command palette">{I.command}</IconBtn>
          {secondary}
          {primary}
        </header>

        <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>{children}</div>
      </main>

      {appOpen && (
        <div
          onClick={() => setAppOpen(false)}
          style={{ position: 'absolute', inset: 0, zIndex: 40 }}
        />
      )}
      {notifOpen && (
        <div
          onClick={() => setNotifOpen(false)}
          style={{ position: 'absolute', inset: 0, zIndex: 40 }}
        />
      )}
    </div>
  )
}

const SidebarGroup = ({ label, color, children }) => (
  <>
    <div
      style={{
        padding: '6px 8px 4px',
        fontSize: 10,
        fontWeight: 510,
        color,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
      }}
    >
      {label}
    </div>
    {children}
  </>
)

const SunIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
  </svg>
)
const MoonIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
)

const NotifPanel = ({ T, notifs, onClose }) => {
  const [filter, setFilter] = React.useState('all')
  const kindDot = {
    change: '#7170ff',
    approve: '#10b981',
    alert: '#f59e0b',
    doc: '#06b6d4',
    profile: '#ec4899',
  }
  const filtered = filter === 'unread' ? notifs.filter((n) => n.unread) : notifs
  return (
    <div
      style={{
        position: 'absolute',
        top: 38,
        right: 0,
        width: 380,
        zIndex: 60,
        background: T.panel2,
        border: `1px solid ${T.border2}`,
        borderRadius: 10,
        boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '12px 14px',
          borderBottom: `1px solid ${T.border}`,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 510, color: T.text }}>Notifications</div>
        <div style={{ flex: 1 }} />
        <button onClick={() => setFilter('all')} style={tabBtn(filter === 'all', T)}>
          All
        </button>
        <button onClick={() => setFilter('unread')} style={tabBtn(filter === 'unread', T)}>
          Unread · {notifs.filter((n) => n.unread).length}
        </button>
      </div>
      <div style={{ maxHeight: 380, overflow: 'auto' }}>
        {filtered.map((n) => (
          <div
            key={n.id}
            style={{
              padding: '10px 14px',
              borderBottom: `1px solid ${T.border}`,
              display: 'flex',
              gap: 10,
              cursor: 'pointer',
              background: n.unread
                ? T === undefined
                  ? 'transparent'
                  : 'rgba(113,112,255,0.03)'
                : 'transparent',
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: kindDot[n.kind],
                marginTop: 6,
                flexShrink: 0,
              }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, color: T.text2, lineHeight: 1.4 }}>
                <span style={{ fontWeight: 510, color: T.text }}>{n.who}</span> {n.action}
              </div>
              <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>{n.detail}</div>
              <div style={{ fontSize: 10, color: T.text4, marginTop: 4 }}>{n.time} ago</div>
            </div>
            {n.unread && (
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: '#7170ff',
                  marginTop: 6,
                }}
              />
            )}
          </div>
        ))}
      </div>
      <div
        style={{
          padding: '8px 14px',
          borderTop: `1px solid ${T.border}`,
          display: 'flex',
          gap: 12,
          fontSize: 11,
        }}
      >
        <button
          style={{
            background: 'none',
            border: 'none',
            color: T.text3,
            fontSize: 11,
            cursor: 'pointer',
            fontFamily: 'inherit',
            padding: 0,
          }}
        >
          Mark all read
        </button>
        <div style={{ flex: 1 }} />
        <button
          style={{
            background: 'none',
            border: 'none',
            color: '#9ea2ff',
            fontSize: 11,
            cursor: 'pointer',
            fontFamily: 'inherit',
            padding: 0,
          }}
        >
          View all →
        </button>
      </div>
    </div>
  )
}
const tabBtn = (active, T) => ({
  padding: '3px 8px',
  borderRadius: 5,
  background: active ? T.hover : 'transparent',
  border: 'none',
  color: active ? T.text : T.text3,
  fontSize: 11,
  fontWeight: 510,
  cursor: 'pointer',
  fontFamily: 'inherit',
})

const NavItem = ({ label, icon, count, active, urgent, T }) => {
  const TT = T || {
    text: '#f7f8f8',
    text2: '#d0d6e0',
    text3: '#8a8f98',
    text4: '#62666d',
    hover: 'rgba(255,255,255,0.05)',
  }
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '5px 8px',
        borderRadius: 5,
        fontSize: 12,
        fontWeight: 510,
        letterSpacing: '-0.01em',
        color: active ? TT.text : TT.text2,
        background: active ? TT.hover : 'transparent',
        cursor: 'pointer',
      }}
    >
      <span style={{ color: active ? TT.text : TT.text3, display: 'inline-flex' }}>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
      {count != null && (
        <span
          style={{
            fontSize: 10,
            fontWeight: 510,
            color: urgent ? '#fbbf24' : TT.text4,
            background: urgent ? 'rgba(245,158,11,0.1)' : 'transparent',
            padding: urgent ? '1px 5px' : 0,
            borderRadius: 3,
          }}
        >
          {count}
        </span>
      )}
    </div>
  )
}

Object.assign(window, { AppShell, NavItem, APPS, NOTIFS })
