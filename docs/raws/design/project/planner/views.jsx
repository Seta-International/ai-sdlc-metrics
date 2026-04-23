// Planner shell + all views. Consolidated to keep context tight.

// ============ SHELL ============
// sidebar: 'open' | 'collapsed'   — left nav state
// ai: 'panel' | 'rail' | 'off'    — AI pane state (full chat / icon rail / hidden)
const PlannerShell = ({
  active = 'board',
  title,
  subtitle,
  children,
  primary,
  secondary,
  accent,
  sidebar: sidebarProp,
  ai: aiProp,
  aiState = 'idle',
  aiTaskContext,
}) => {
  const A = accent || 'var(--accent, #7170ff)'
  const [sidebarInner, setSidebarInner] = React.useState('open')
  const [aiInner, setAiInner] = React.useState('panel')
  const sidebar = sidebarProp ?? sidebarInner
  const ai = aiProp ?? aiInner
  const setSidebar = sidebarProp ? () => {} : setSidebarInner
  const setAi = aiProp ? () => {} : setAiInner

  const sidebarTop = [
    { id: 'myday', label: 'My Day', icon: PI.sun, count: 5 },
    { id: 'mytasks', label: 'My Tasks', icon: PI.listChecks, count: 12 },
    { id: 'myplans', label: 'My Plans', icon: PI.folder },
    { id: 'transcripts', label: 'Meetings', icon: I.mail, count: 8 },
  ]
  const plans = [
    { id: 'p1', name: 'Q1 Launch · Web Planner', dot: '#7170ff', active: true },
    { id: 'p2', name: 'Rituals · weekly ops', dot: '#06b6d4' },
    { id: 'p3', name: 'Hiring · Q2 engineering', dot: '#f59e0b' },
    { id: 'p4', name: 'Design system v3', dot: '#10b981' },
    { id: 'p5', name: 'Personal · errands', dot: '#ec4899', personal: true },
  ]

  // Column widths derived from state
  const leftW = sidebar === 'collapsed' ? 52 : 228
  const rightW = ai === 'panel' ? 360 : ai === 'rail' ? 44 : 0
  const cols = [`${leftW}px`, '1fr']
  if (rightW > 0) cols.push(`${rightW}px`)

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: cols.join(' '),
        height: '100%',
        background: '#08090a',
        color: '#f7f8f8',
        fontFamily: 'Inter, -apple-system, system-ui, sans-serif',
        fontFeatureSettings: '"cv01","ss03"',
      }}
    >
      {sidebar === 'collapsed' ? (
        <CollapsedSidebar
          active={active}
          plans={plans}
          accent={A}
          onExpand={() => setSidebar('open')}
        />
      ) : (
        <aside
          style={{
            background: '#0f1011',
            borderRight: '1px solid rgba(255,255,255,0.05)',
            display: 'flex',
            flexDirection: 'column',
            minWidth: 0,
          }}
        >
          <div style={{ padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px' }}>
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 5,
                  background: 'linear-gradient(135deg, #7170ff, #9ea2ff)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                P
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 510 }}>Planner</div>
                <div style={{ fontSize: 10, color: '#62666d' }}>SETA International</div>
              </div>
              <button
                onClick={() => setSidebar('collapsed')}
                title="Collapse sidebar"
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 4,
                  border: 'none',
                  background: 'transparent',
                  color: '#62666d',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                  <rect
                    x="2"
                    y="3"
                    width="12"
                    height="10"
                    rx="1.5"
                    stroke="currentColor"
                    strokeWidth="1.4"
                  />
                  <path
                    d="M6 3v10M4 6l1.5 2L4 10"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
          </div>

          <div style={{ padding: '8px 10px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '5px 8px',
                height: 28,
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.05)',
                borderRadius: 6,
                cursor: 'pointer',
              }}
            >
              <span style={{ color: '#62666d' }}>{I.search}</span>
              <span style={{ flex: 1, fontSize: 12, color: '#62666d' }}>Search tasks…</span>
              <Kbd>⌘K</Kbd>
            </div>
          </div>

          <nav style={{ flex: 1, padding: '4px 6px', overflow: 'auto' }}>
            <div
              style={{
                padding: '6px 8px 4px',
                fontSize: 10,
                fontWeight: 510,
                color: '#62666d',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}
            >
              Personal
            </div>
            {sidebarTop.map((n) => (
              <PlanNavItem key={n.id} {...n} active={active === n.id} accent={A} />
            ))}

            <div style={{ padding: '14px 8px 4px', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 510,
                  color: '#62666d',
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                }}
              >
                Plans
              </span>
              <div style={{ flex: 1 }} />
              <span style={{ color: '#62666d', cursor: 'pointer' }}>{I.plus}</span>
            </div>
            {plans.map((p) => (
              <div
                key={p.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '5px 8px',
                  borderRadius: 5,
                  fontSize: 12,
                  fontWeight: 510,
                  color: p.active ? '#f7f8f8' : '#d0d6e0',
                  background: p.active ? 'rgba(255,255,255,0.05)' : 'transparent',
                  cursor: 'pointer',
                }}
              >
                <span
                  style={{ width: 6, height: 6, borderRadius: 2, background: p.dot, flexShrink: 0 }}
                />
                <span
                  style={{
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {p.name}
                </span>
                {p.personal && <span style={{ fontSize: 9, color: '#62666d' }}>personal</span>}
              </div>
            ))}
          </nav>

          <div style={{ padding: 10, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 4 }}>
              <Avatar name="You" initials="YO" deptColor={A} size={24} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 510, color: '#d0d6e0' }}>You</div>
                <div style={{ fontSize: 10, color: '#62666d' }}>Staff Engineer</div>
              </div>
              <span style={{ color: '#62666d' }}>{I.dots}</span>
            </div>
          </div>
        </aside>
      )}

      <main style={{ display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
        <header
          style={{
            height: 44,
            borderBottom: '1px solid rgba(255,255,255,0.05)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '0 16px',
            background: 'rgba(15,16,17,0.6)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 12,
              color: '#8a8f98',
            }}
          >
            <span style={{ color: '#62666d' }}>{I.home}</span>
            <span>{I.slash}</span>
            <span>Plans</span>
            <span>{I.slash}</span>
            <span style={{ color: '#f7f8f8', fontWeight: 510 }}>
              {title || 'Q1 Launch · Web Planner'}
            </span>
            {subtitle && (
              <>
                <span>{I.slash}</span>
                <span style={{ color: '#d0d6e0' }}>{subtitle}</span>
              </>
            )}
          </div>
          <div style={{ flex: 1 }} />
          <button
            onClick={() => setAi(ai === 'panel' ? 'rail' : 'panel')}
            title={ai === 'panel' ? 'Collapse AI panel' : 'Open AI panel'}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              height: 26,
              padding: '0 9px',
              borderRadius: 5,
              background: ai === 'panel' ? 'rgba(113,112,255,0.08)' : 'rgba(255,255,255,0.02)',
              border: `1px solid ${ai === 'panel' ? 'rgba(113,112,255,0.25)' : 'rgba(255,255,255,0.08)'}`,
              color: ai === 'panel' ? A : '#d0d6e0',
              fontSize: 11,
              fontWeight: 510,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <path
                d="M8 2 9.3 5.5l3.5 1.3-3.5 1.3L8 11.6 6.7 8.1 3.2 6.8l3.5-1.3L8 2z"
                fill="currentColor"
              />
            </svg>
            <span>Ask AI</span>
            <span
              style={{
                fontSize: 9.5,
                fontWeight: 600,
                padding: '1px 4px',
                borderRadius: 3,
                background: 'rgba(255,255,255,0.06)',
                color: '#8a8f98',
                fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
              }}
            >
              ⌘J
            </span>
          </button>
          {secondary}
          {primary}
        </header>
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>{children}</div>
      </main>

      {ai === 'panel' && (
        <AIChatPanel state={aiState} taskContext={aiTaskContext} onCollapse={() => setAi('rail')} />
      )}
      {ai === 'rail' && <AIChatRail onExpand={() => setAi('panel')} />}
    </div>
  )
}

// Collapsed left sidebar — icon-only rail
const CollapsedSidebar = ({ active, plans, accent, onExpand }) => {
  const items = [
    { id: 'myday', icon: PI.sun, title: 'My Day' },
    { id: 'mytasks', icon: PI.listChecks, title: 'My Tasks' },
    { id: 'myplans', icon: PI.folder, title: 'My Plans' },
  ]
  return (
    <aside
      style={{
        background: '#0f1011',
        borderRight: '1px solid rgba(255,255,255,0.05)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '10px 0 10px',
      }}
    >
      <button
        onClick={onExpand}
        title="Expand sidebar"
        style={{
          width: 28,
          height: 28,
          borderRadius: 6,
          border: 'none',
          background: 'linear-gradient(135deg, #7170ff, #9ea2ff)',
          color: '#fff',
          fontSize: 12,
          fontWeight: 600,
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        P
      </button>
      <button
        title="Search (⌘K)"
        style={{
          marginTop: 8,
          width: 28,
          height: 28,
          borderRadius: 6,
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.06)',
          color: '#8a8f98',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {I.search}
      </button>

      <div
        style={{ height: 1, width: 22, background: 'rgba(255,255,255,0.06)', margin: '8px 0 4px' }}
      />

      {items.map((it) => (
        <button
          key={it.id}
          title={it.title}
          style={{
            marginTop: 2,
            width: 28,
            height: 28,
            borderRadius: 6,
            background: active === it.id ? 'rgba(255,255,255,0.06)' : 'transparent',
            border: 'none',
            color: active === it.id ? '#f7f8f8' : '#8a8f98',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {it.icon}
        </button>
      ))}

      <div
        style={{ height: 1, width: 22, background: 'rgba(255,255,255,0.06)', margin: '10px 0 4px' }}
      />

      {plans.slice(0, 5).map((p) => (
        <button
          key={p.id}
          title={p.name}
          style={{
            marginTop: 4,
            width: 28,
            height: 28,
            borderRadius: 6,
            background: p.active ? 'rgba(255,255,255,0.06)' : 'transparent',
            border: 'none',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
          }}
        >
          <span
            style={{
              width: 18,
              height: 18,
              borderRadius: 4,
              background: `${p.dot}22`,
              color: p.dot,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 10,
              fontWeight: 600,
              border: `1px solid ${p.dot}44`,
            }}
          >
            {p.name.charAt(0).toUpperCase()}
          </span>
          {p.active && (
            <span
              style={{
                position: 'absolute',
                left: -3,
                top: 6,
                bottom: 6,
                width: 2,
                background: accent,
                borderRadius: 2,
              }}
            />
          )}
        </button>
      ))}

      <div style={{ flex: 1 }} />

      <Avatar name="You" initials="YO" deptColor={accent} size={26} />
    </aside>
  )
}

const PlanNavItem = ({ label, icon, count, active, accent }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '5px 8px',
      borderRadius: 5,
      fontSize: 12,
      fontWeight: 510,
      color: active ? '#f7f8f8' : '#d0d6e0',
      background: active ? 'rgba(255,255,255,0.05)' : 'transparent',
      cursor: 'pointer',
    }}
  >
    <span style={{ color: active ? accent : '#8a8f98', display: 'inline-flex' }}>{icon}</span>
    <span style={{ flex: 1 }}>{label}</span>
    {count != null && <span style={{ fontSize: 10, color: '#62666d' }}>{count}</span>}
  </div>
)

// ============ VIEW TABS + FILTER BAR ============
const ViewTabs = ({ active = 'board' }) => {
  const tabs = [
    { id: 'board', label: 'Board', icon: PI.kanban },
    { id: 'grid', label: 'Grid', icon: PI.table },
    { id: 'schedule', label: 'Schedule', icon: PI.schedule },
    { id: 'charts', label: 'Charts', icon: PI.pie },
  ]
  return (
    <div
      style={{
        display: 'inline-flex',
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 6,
        padding: 2,
      }}
    >
      {tabs.map((t) => (
        <button
          key={t.id}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            padding: '4px 10px',
            borderRadius: 4,
            background: active === t.id ? 'rgba(255,255,255,0.06)' : 'transparent',
            color: active === t.id ? '#f7f8f8' : '#8a8f98',
            border: 'none',
            fontSize: 12,
            fontWeight: 510,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {t.icon}
          {t.label}
        </button>
      ))}
    </div>
  )
}

const FilterBar = ({ view = 'board' }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '10px 16px',
      borderBottom: '1px solid rgba(255,255,255,0.05)',
    }}
  >
    <ViewTabs active={view} />
    <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.08)', margin: '0 4px' }} />
    <FChip label="Due" value="This week" active />
    <FChip label="Priority" value="High, Urgent" active />
    <FChip label="Assignee" />
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
    <Btn variant="ghost" size="sm" icon={I.columns}>
      Group: Bucket
    </Btn>
    <Btn variant="ghost" size="sm" icon={I.sort}>
      Sort
    </Btn>
  </div>
)

const FChip = ({ label, value, active }) => (
  <button
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      padding: '3px 6px 3px 8px',
      background: active ? 'rgba(255,255,255,0.04)' : 'transparent',
      border: `1px solid rgba(255,255,255,${active ? 0.08 : 0.05})`,
      borderRadius: 6,
      color: active ? '#f7f8f8' : '#8a8f98',
      fontSize: 11,
      fontWeight: 510,
      cursor: 'pointer',
      fontFamily: 'inherit',
    }}
  >
    <span style={{ color: '#62666d' }}>{label}</span>
    {value && (
      <>
        <span style={{ color: '#3e3e44' }}>:</span>
        <span>{value}</span>
      </>
    )}
    {active && <span style={{ color: '#62666d', marginLeft: 2 }}>{I.x}</span>}
  </button>
)

// ============ TASK CARD ============
const TaskCard = ({ task, compact }) => {
  const done = task.progress === 100
  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 7,
        padding: compact ? '7px 9px' : '9px 11px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        cursor: 'pointer',
      }}
    >
      {task.cover && (
        <div
          style={{
            margin: compact ? '-7px -9px 2px' : '-9px -11px 2px',
            height: 60,
            borderRadius: '7px 7px 0 0',
            background: 'linear-gradient(135deg, #2a2135, #3e2a5a)',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}
        />
      )}
      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
        <span style={{ paddingTop: 1 }}>
          <Progress value={task.progress} size={13} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 510,
              color: done ? '#62666d' : '#f7f8f8',
              lineHeight: 1.4,
              letterSpacing: '-0.01em',
              textDecoration: done ? 'line-through' : 'none',
            }}
          >
            {task.title}
          </div>
        </div>
        {task.priority === 9 && (
          <span style={{ paddingTop: 1 }}>
            <Priority level={9} />
          </span>
        )}
      </div>

      {task.labels && task.labels.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {task.labels.map((s) => (
            <LabelPill key={s} slot={s} />
          ))}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 18 }}>
        <AssigneeStack ids={task.assignees || []} size={18} />
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#62666d' }}>
          {task.checklist && task.checklist[1] > 0 && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 2,
                fontSize: 10,
                color: task.checklist[0] === task.checklist[1] ? '#34d399' : '#8a8f98',
              }}
            >
              {PI.checklist}
              {task.checklist[0]}/{task.checklist[1]}
            </span>
          )}
          {task.attach > 0 && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 2,
                fontSize: 10,
                color: '#8a8f98',
              }}
            >
              {PI.paperclip}
              {task.attach}
            </span>
          )}
          {task.comments > 0 && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 2,
                fontSize: 10,
                color: '#8a8f98',
              }}
            >
              {PI.comment}
              {task.comments}
            </span>
          )}
          <DueBadge date={task.due} />
        </div>
      </div>
    </div>
  )
}

// ============ BOARD ============
const BoardView = () => (
  <PlannerShell
    active="board"
    primary={
      <Btn variant="primary" size="md" icon={I.plus}>
        New task
      </Btn>
    }
    secondary={
      <Btn variant="ghost" size="md" icon={I.share}>
        Share
      </Btn>
    }
  >
    <FilterBar view="board" />
    <div
      style={{
        display: 'flex',
        gap: 10,
        padding: '12px 16px',
        alignItems: 'flex-start',
        overflow: 'auto',
        flex: 1,
        minHeight: 0,
      }}
    >
      {PLANNER_DATA.BUCKETS.map((b) => (
        <div
          key={b.id}
          style={{ width: 272, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 6 }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 4px 2px' }}>
            <span style={{ color: '#62666d', display: 'inline-flex' }}>{PI.grip}</span>
            <span
              style={{ fontSize: 12, fontWeight: 510, color: '#f7f8f8', letterSpacing: '-0.01em' }}
            >
              {b.name}
            </span>
            <span
              style={{
                fontSize: 10,
                fontWeight: 510,
                color: '#62666d',
                background: 'rgba(255,255,255,0.04)',
                borderRadius: 4,
                padding: '1px 5px',
                minWidth: 16,
                textAlign: 'center',
              }}
            >
              {b.count}
            </span>
            <div style={{ flex: 1 }} />
            <span style={{ color: '#62666d', cursor: 'pointer' }}>{I.plus}</span>
            <span style={{ color: '#62666d', cursor: 'pointer' }}>{I.dots}</span>
          </div>
          <button
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              width: '100%',
              padding: '6px 9px',
              background: 'rgba(255,255,255,0.015)',
              border: '1px dashed rgba(255,255,255,0.08)',
              borderRadius: 7,
              color: '#62666d',
              fontSize: 11,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {I.plus}
            <span>Add task</span>
          </button>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {b.tasks.map((t) => (
              <TaskCard key={t.id} task={t} />
            ))}
          </div>
        </div>
      ))}
      <div style={{ width: 272, flexShrink: 0, padding: '24px 12px' }}>
        <button
          style={{
            width: '100%',
            padding: '10px',
            background: 'rgba(255,255,255,0.02)',
            border: '1px dashed rgba(255,255,255,0.1)',
            borderRadius: 7,
            color: '#62666d',
            fontSize: 12,
            cursor: 'pointer',
            fontFamily: 'inherit',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            justifyContent: 'center',
          }}
        >
          {I.plus}
          <span>Add bucket</span>
        </button>
      </div>
    </div>
  </PlannerShell>
)

// ============ GRID ============
const GridView = ({ initialSelected = [] }) => {
  const allTasks = PLANNER_DATA.BUCKETS.flatMap((b) =>
    b.tasks.map((t) => ({ ...t, bucket: b.name })),
  )
  const selected = new Set(initialSelected)
  return (
    <PlannerShell
      active="grid"
      primary={
        <Btn variant="primary" size="md" icon={I.plus}>
          New task
        </Btn>
      }
    >
      <FilterBar view="grid" />
      {selected.size > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '8px 16px',
            background: 'rgba(113,112,255,0.06)',
            borderBottom: '1px solid rgba(113,112,255,0.2)',
            fontSize: 12,
          }}
        >
          <span style={{ color: '#9ea2ff', fontWeight: 510 }}>{selected.size} selected</span>
          <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.08)' }} />
          <Btn variant="subtle" size="sm">
            Set bucket
          </Btn>
          <Btn variant="subtle" size="sm">
            Priority
          </Btn>
          <Btn variant="subtle" size="sm">
            Assign
          </Btn>
          <Btn variant="subtle" size="sm">
            Due date
          </Btn>
          <Btn variant="subtle" size="sm">
            Labels
          </Btn>
          <div style={{ flex: 1 }} />
          <Btn variant="danger" size="sm">
            Delete
          </Btn>
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '32px 28px minmax(360px,2.2fr) 120px 120px 120px 120px 110px',
            padding: '6px 16px',
            fontSize: 10,
            fontWeight: 510,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            color: '#62666d',
            borderBottom: '1px solid rgba(255,255,255,0.05)',
            position: 'sticky',
            top: 0,
            background: '#08090a',
            zIndex: 1,
          }}
        >
          <span />
          <span />
          <span>Title</span>
          <span>Bucket</span>
          <span>Priority</span>
          <span>Due</span>
          <span>Assignees</span>
          <span>Labels</span>
        </div>
        {allTasks.map((t, i) => (
          <div
            key={t.id}
            style={{
              display: 'grid',
              gridTemplateColumns: '32px 28px minmax(360px,2.2fr) 120px 120px 120px 120px 110px',
              padding: '6px 16px',
              alignItems: 'center',
              fontSize: 12,
              borderBottom: '1px solid rgba(255,255,255,0.04)',
              background: selected.has(i) ? 'rgba(113,112,255,0.05)' : 'transparent',
            }}
          >
            <span>
              <Checkbox checked={selected.has(i)} />
            </span>
            <Progress value={t.progress} size={13} />
            <span
              style={{
                color: t.progress === 100 ? '#62666d' : '#f7f8f8',
                fontWeight: 510,
                textDecoration: t.progress === 100 ? 'line-through' : 'none',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {t.title}
            </span>
            <span style={{ color: '#d0d6e0' }}>{t.bucket}</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Priority level={t.priority} />
              <span style={{ color: '#d0d6e0' }}>
                {['', 'Low', '', 'Normal', '', 'High', '', '', '', 'Urgent'][t.priority] ||
                  'Normal'}
              </span>
            </span>
            <span>
              <DueBadge date={t.due} />
            </span>
            <AssigneeStack ids={t.assignees} />
            <span style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
              {t.labels.slice(0, 2).map((s) => (
                <LabelPill key={s} slot={s} />
              ))}
              {t.labels.length > 2 && (
                <span style={{ fontSize: 10, color: '#62666d' }}>+{t.labels.length - 2}</span>
              )}
            </span>
          </div>
        ))}
      </div>
    </PlannerShell>
  )
}

const Checkbox = ({ checked }) => (
  <span
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 14,
      height: 14,
      borderRadius: 3,
      border: `1px solid ${checked ? '#7170ff' : 'rgba(255,255,255,0.15)'}`,
      background: checked ? '#7170ff' : 'transparent',
      color: '#fff',
    }}
  >
    {checked && I.check}
  </span>
)

// ============ SCHEDULE ============
const ScheduleView = () => {
  const days = PLANNER_DATA.SCHEDULE_DAYS
  const hours = ['9', '10', '11', '12', '1', '2', '3', '4', '5']
  const events = [
    { day: 0, start: 1, span: 2, title: 'Board virtualization', color: '#7170ff' },
    { day: 1, start: 0, span: 1, title: 'Label editor', color: '#ef4444' },
    { day: 2, start: 3, span: 2, title: 'Conflict resolver', color: '#06b6d4' },
    { day: 3, start: 2, span: 1, title: 'Due badge states', color: '#06b6d4' },
    { day: 3, start: 5, span: 2, title: 'Charts panel', color: '#f59e0b' },
    { day: 4, start: 1, span: 3, title: 'Column reorder polish', color: '#06b6d4' },
  ]
  return (
    <PlannerShell
      active="schedule"
      primary={
        <Btn variant="primary" size="md" icon={I.plus}>
          New task
        </Btn>
      }
    >
      <FilterBar view="schedule" />
      <div
        style={{
          padding: '10px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <Btn variant="ghost" size="sm">
          ← Week
        </Btn>
        <Btn variant="ghost" size="sm">
          Today
        </Btn>
        <Btn variant="ghost" size="sm">
          Week →
        </Btn>
        <div style={{ fontSize: 12, color: '#d0d6e0', fontWeight: 510, marginLeft: 8 }}>
          Apr 20 – 26, 2026
        </div>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '50px repeat(7, 1fr)',
          flex: 1,
          minHeight: 0,
        }}
      >
        <div style={{ borderRight: '1px solid rgba(255,255,255,0.05)' }} />
        {days.map((d) => (
          <div
            key={d}
            style={{
              padding: '8px 10px',
              fontSize: 11,
              fontWeight: 510,
              color: '#d0d6e0',
              borderRight: '1px solid rgba(255,255,255,0.05)',
              borderBottom: '1px solid rgba(255,255,255,0.05)',
            }}
          >
            {d}
          </div>
        ))}
        {hours.map((h, hi) => (
          <React.Fragment key={h}>
            <div
              style={{
                padding: '6px',
                fontSize: 10,
                fontFamily: 'IBM Plex Mono, monospace',
                color: '#62666d',
                borderRight: '1px solid rgba(255,255,255,0.05)',
                borderBottom: '1px solid rgba(255,255,255,0.03)',
                textAlign: 'right',
              }}
            >
              {h}
            </div>
            {days.map((_, di) => {
              const ev = events.find((e) => e.day === di && e.start === hi)
              return (
                <div
                  key={di}
                  style={{
                    minHeight: 52,
                    position: 'relative',
                    borderRight: '1px solid rgba(255,255,255,0.05)',
                    borderBottom: '1px solid rgba(255,255,255,0.03)',
                  }}
                >
                  {ev && (
                    <div
                      style={{
                        position: 'absolute',
                        inset: 3,
                        height: ev.span * 52 - 6,
                        background: `${ev.color}22`,
                        borderLeft: `2px solid ${ev.color}`,
                        borderRadius: 4,
                        padding: '4px 6px',
                        fontSize: 10,
                        fontWeight: 510,
                        color: ev.color,
                      }}
                    >
                      {ev.title}
                    </div>
                  )}
                </div>
              )
            })}
          </React.Fragment>
        ))}
      </div>
    </PlannerShell>
  )
}

// ============ CHARTS ============
const ChartsView = () => (
  <PlannerShell
    active="charts"
    primary={
      <Btn variant="ghost" size="md" icon={I.download}>
        Export CSV
      </Btn>
    }
  >
    <FilterBar view="charts" />
    <div
      style={{
        padding: 16,
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: 14,
        flex: 1,
        minHeight: 0,
        overflow: 'auto',
      }}
    >
      <ChartCard title="Completion trend" subtitle="Last 8 weeks · weekly throughput">
        <LineChart />
      </ChartCard>
      <ChartCard title="By priority" subtitle="Open tasks · 28 total">
        <BarChart
          data={[
            ['Urgent', 4, '#ef4444'],
            ['High', 9, '#f59e0b'],
            ['Normal', 12, '#d0d6e0'],
            ['Low', 3, '#62666d'],
          ]}
        />
      </ChartCard>
      <ChartCard title="By bucket" subtitle="Open tasks">
        <BarChart
          data={[
            ['Backlog', 9, '#62666d'],
            ['To do', 7, '#7170ff'],
            ['In progress', 6, '#06b6d4'],
            ['In review', 4, '#f59e0b'],
            ['Done', 11, '#10b981'],
          ]}
        />
      </ChartCard>
      <ChartCard title="Burndown" subtitle="Q1 Launch milestone · ideal vs actual">
        <BurndownChart />
      </ChartCard>
    </div>
  </PlannerShell>
)

const ChartCard = ({ title, subtitle, children }) => (
  <div
    style={{
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 8,
      padding: 16,
      display: 'flex',
      flexDirection: 'column',
      minHeight: 280,
    }}
  >
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 14 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 510, color: '#f7f8f8', letterSpacing: '-0.01em' }}>
          {title}
        </div>
        <div style={{ fontSize: 11, color: '#62666d', marginTop: 2 }}>{subtitle}</div>
      </div>
      <span style={{ color: '#62666d' }}>{I.dots}</span>
    </div>
    <div style={{ flex: 1, display: 'flex', alignItems: 'stretch' }}>{children}</div>
  </div>
)

const LineChart = () => {
  const pts = [12, 18, 15, 22, 28, 24, 31, 29]
  const max = 35,
    w = 400,
    h = 160
  const path = pts
    .map((v, i) => `${i === 0 ? 'M' : 'L'} ${(i / (pts.length - 1)) * w} ${h - (v / max) * h}`)
    .join(' ')
  const area = `${path} L ${w} ${h} L 0 ${h} Z`
  return (
    <svg viewBox={`0 0 ${w} ${h + 20}`} width="100%" height="100%" preserveAspectRatio="none">
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7170ff" stopOpacity="0.3" />
          <stop offset="1" stopColor="#7170ff" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 1, 2, 3].map((i) => (
        <line
          key={i}
          x1="0"
          x2={w}
          y1={(i / 3) * h}
          y2={(i / 3) * h}
          stroke="rgba(255,255,255,0.04)"
        />
      ))}
      <path d={area} fill="url(#lg)" />
      <path d={path} stroke="#7170ff" strokeWidth="1.5" fill="none" />
      {pts.map((v, i) => (
        <circle
          key={i}
          cx={(i / (pts.length - 1)) * w}
          cy={h - (v / max) * h}
          r="2.5"
          fill="#7170ff"
        />
      ))}
    </svg>
  )
}

const BarChart = ({ data }) => {
  const max = Math.max(...data.map((d) => d[1]))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
      {data.map(([label, value, color]) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11 }}>
          <span style={{ width: 80, color: '#d0d6e0' }}>{label}</span>
          <div
            style={{
              flex: 1,
              height: 14,
              background: 'rgba(255,255,255,0.03)',
              borderRadius: 3,
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            <div
              style={{
                width: `${(value / max) * 100}%`,
                height: '100%',
                background: `linear-gradient(90deg, ${color}33, ${color}bb)`,
                borderLeft: `2px solid ${color}`,
              }}
            />
          </div>
          <span
            style={{
              width: 24,
              textAlign: 'right',
              color: '#62666d',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {value}
          </span>
        </div>
      ))}
    </div>
  )
}

const BurndownChart = () => {
  const ideal = [40, 35, 30, 25, 20, 15, 10, 5, 0]
  const actual = [40, 38, 36, 33, 27, 24, 18, 14, 11]
  const max = 40,
    w = 400,
    h = 160
  const pp = (arr) =>
    arr
      .map((v, i) => `${i === 0 ? 'M' : 'L'} ${(i / (arr.length - 1)) * w} ${h - (v / max) * h}`)
      .join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h + 20}`} width="100%" height="100%" preserveAspectRatio="none">
      {[0, 1, 2, 3].map((i) => (
        <line
          key={i}
          x1="0"
          x2={w}
          y1={(i / 3) * h}
          y2={(i / 3) * h}
          stroke="rgba(255,255,255,0.04)"
        />
      ))}
      <path d={pp(ideal)} stroke="#62666d" strokeDasharray="4 3" strokeWidth="1.25" fill="none" />
      <path d={pp(actual)} stroke="#f59e0b" strokeWidth="1.75" fill="none" />
    </svg>
  )
}

// ============ MY DAY ============
const MyDayView = () => (
  <PlannerShell
    active="myday"
    title="My Day"
    subtitle="Tue, Apr 22"
    primary={
      <Btn variant="primary" size="md" icon={I.plus}>
        Add from tasks
      </Btn>
    }
  >
    <div style={{ padding: 20, flex: 1, minHeight: 0, overflow: 'auto' }}>
      <div style={{ maxWidth: 680, margin: '0 auto' }}>
        <div
          style={{
            padding: '12px 14px',
            borderRadius: 8,
            background: 'rgba(245,158,11,0.06)',
            border: '1px solid rgba(245,158,11,0.2)',
            marginBottom: 18,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <span style={{ color: '#fbbf24' }}>{I.info}</span>
          <div style={{ flex: 1, fontSize: 12, color: '#d0d6e0' }}>
            <span style={{ fontWeight: 510, color: '#fbbf24' }}>1 task</span> carried over from
            yesterday
          </div>
          <Btn variant="subtle" size="sm">
            Review
          </Btn>
          <Btn variant="ghost" size="sm">
            Dismiss
          </Btn>
        </div>

        <div
          style={{
            fontSize: 10,
            fontWeight: 510,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: '#62666d',
            marginBottom: 10,
          }}
        >
          Focus · 5 tasks · est. 3.5h
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {PLANNER_DATA.MY_DAY.map((t, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '9px 12px',
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 7,
              }}
            >
              <Progress value={t.progress} />
              <Priority level={t.priority} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 510,
                    color: '#f7f8f8',
                    letterSpacing: '-0.01em',
                  }}
                >
                  {t.title}
                </div>
                <div
                  style={{
                    fontSize: 10,
                    color: '#62666d',
                    marginTop: 2,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  {t.personal ? (
                    <span style={{ color: '#9ea2ff' }}>● Personal</span>
                  ) : (
                    <span>● {t.plan}</span>
                  )}
                  {t.carryOver && <span style={{ color: '#fbbf24' }}>· carried over</span>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 3 }}>
                {t.labels.map((s) => (
                  <LabelPill key={s} slot={s} />
                ))}
              </div>
              <AssigneeStack ids={t.assignees} />
              {t.due === 'today' && <DueBadge date="2026-04-22" />}
            </div>
          ))}
        </div>
      </div>
    </div>
  </PlannerShell>
)

// ============ MY PLANS ============
const MyPlansView = () => (
  <PlannerShell
    active="myplans"
    title="My Plans"
    primary={
      <Btn variant="primary" size="md" icon={I.plus}>
        New plan
      </Btn>
    }
  >
    <div style={{ padding: 20, flex: 1, minHeight: 0, overflow: 'auto' }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 510,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: '#62666d',
          marginBottom: 10,
        }}
      >
        Personal
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 10,
          marginBottom: 24,
        }}
      >
        {PLANNER_DATA.PLANS.filter((p) => p.personal).map((p) => (
          <PlanCard key={p.id} plan={p} />
        ))}
      </div>
      <div
        style={{
          fontSize: 10,
          fontWeight: 510,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: '#62666d',
          marginBottom: 10,
        }}
      >
        Team
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        {PLANNER_DATA.PLANS.filter((p) => !p.personal).map((p) => (
          <PlanCard key={p.id} plan={p} />
        ))}
      </div>
    </div>
  </PlannerShell>
)

const PlanCard = ({ plan }) => (
  <div
    style={{
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 8,
      padding: 14,
      cursor: 'pointer',
    }}
  >
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 6,
          background: `linear-gradient(135deg, ${plan.personal ? '#ec4899' : '#7170ff'}44, ${plan.personal ? '#ec4899' : '#7170ff'}22)`,
          border: `1px solid ${plan.personal ? '#ec4899' : '#7170ff'}55`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        {plan.name[0]}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 510, color: '#f7f8f8', letterSpacing: '-0.01em' }}>
          {plan.name}
        </div>
        <div
          style={{
            fontSize: 11,
            color: '#62666d',
            marginTop: 4,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span>
            {plan.members} {plan.members === 1 ? 'member' : 'members'}
          </span>
          <span style={{ textTransform: 'capitalize' }}>· {plan.role}</span>
        </div>
        <div style={{ fontSize: 10, color: '#62666d', marginTop: 6 }}>Updated {plan.updated}</div>
      </div>
    </div>
  </div>
)

// ============ TASK DETAIL ============
const TaskDetail = () => {
  const task = PLANNER_DATA.BUCKETS[1].tasks[3] // "Ship label editor"
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 420px',
        height: '100%',
        background: '#08090a',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
    >
      <div style={{ background: '#0a0a0b', opacity: 0.4 }} />
      <div
        style={{
          background: '#0f1011',
          borderLeft: '1px solid rgba(255,255,255,0.08)',
          display: 'flex',
          flexDirection: 'column',
          color: '#f7f8f8',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 14px',
            borderBottom: '1px solid rgba(255,255,255,0.05)',
          }}
        >
          <Btn variant="ghost" size="sm">
            ← Back
          </Btn>
          <div style={{ fontSize: 11, color: '#62666d' }}>Q1 Launch · To do</div>
          <div style={{ flex: 1 }} />
          <IconBtn title="Copy link">{I.share}</IconBtn>
          <IconBtn title="More">{I.dots}</IconBtn>
          <IconBtn title="Close">{I.x}</IconBtn>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '16px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <Progress value={task.progress} size={16} />
            <span
              style={{ fontSize: 10, fontFamily: 'IBM Plex Mono, monospace', color: '#62666d' }}
            >
              TASK-1038
            </span>
          </div>
          <h1
            style={{
              margin: 0,
              fontSize: 18,
              fontWeight: 510,
              color: '#f7f8f8',
              letterSpacing: '-0.02em',
              lineHeight: 1.35,
              marginBottom: 16,
            }}
          >
            {task.title}
          </h1>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '90px 1fr',
              gap: '10px 14px',
              fontSize: 12,
              marginBottom: 16,
            }}
          >
            <span style={{ color: '#62666d' }}>Bucket</span>
            <span style={{ color: '#d0d6e0' }}>To do</span>
            <span style={{ color: '#62666d' }}>Priority</span>
            <span
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#fbbf24' }}
            >
              <Priority level={9} />
              Urgent
            </span>
            <span style={{ color: '#62666d' }}>Due</span>
            <span>
              <DueBadge date={task.due} />
            </span>
            <span style={{ color: '#62666d' }}>Assignees</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <AssigneeStack ids={task.assignees} size={20} />
              <span style={{ color: '#62666d', fontSize: 11 }}>Ana, Mei, Diego</span>
            </span>
            <span style={{ color: '#62666d' }}>Labels</span>
            <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {task.labels.map((s) => (
                <LabelPill key={s} slot={s} />
              ))}
            </span>
          </div>

          <Section label="Description">
            <div style={{ fontSize: 12, color: '#d0d6e0', lineHeight: 1.6 }}>
              Ship the label editor with a hard ceiling of 12 slots per plan. Reuse the color swatch
              from the design system. Editor opens from the plan settings page and from any label
              pill's edit affordance.
            </div>
          </Section>

          <Section label={`Checklist · ${task.checklist[0]}/${task.checklist[1]}`}>
            {[
              'Define slot model in DB',
              'Color picker component',
              'Plan settings route',
              'Edit from task card',
            ].map((t, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '4px 0',
                  fontSize: 12,
                }}
              >
                <Checkbox checked={i < task.checklist[0]} />
                <span
                  style={{
                    flex: 1,
                    color: i < task.checklist[0] ? '#62666d' : '#d0d6e0',
                    textDecoration: i < task.checklist[0] ? 'line-through' : 'none',
                  }}
                >
                  {t}
                </span>
              </div>
            ))}
          </Section>

          <Section label="Attachments">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {[
                'slot-model.sql · 2.3 KB',
                'swatch-specs.fig · 1.1 MB',
                'migration-plan.md · 4.5 KB',
              ].map((n) => (
                <div
                  key={n}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 8px',
                    background: 'rgba(255,255,255,0.02)',
                    borderRadius: 5,
                    fontSize: 11,
                    color: '#d0d6e0',
                  }}
                >
                  <span style={{ color: '#62666d' }}>{PI.paperclip}</span>
                  {n}
                </div>
              ))}
            </div>
          </Section>

          <Section label={`Comments · ${task.comments}`}>
            {[
              {
                who: 'Ana Silva',
                color: '#7170ff',
                time: '2h',
                text: 'Slot model landed. Ready for review on #4521.',
              },
              {
                who: 'Mei Chen',
                color: '#06b6d4',
                time: '1h',
                text: 'Picker works but a11y needs another pass — keyboard focus trap is leaky.',
              },
            ].map((c, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  gap: 8,
                  padding: '8px 0',
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                }}
              >
                <Avatar
                  name={c.who}
                  initials={c.who
                    .split(' ')
                    .map((n) => n[0])
                    .join('')}
                  deptColor={c.color}
                  size={22}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: '#62666d' }}>
                    <span style={{ color: '#f7f8f8', fontWeight: 510 }}>{c.who}</span> · {c.time}{' '}
                    ago
                  </div>
                  <div style={{ fontSize: 12, color: '#d0d6e0', marginTop: 2, lineHeight: 1.5 }}>
                    {c.text}
                  </div>
                </div>
              </div>
            ))}
          </Section>
        </div>
      </div>
    </div>
  )
}

const Section = ({ label, children }) => (
  <div style={{ marginBottom: 18 }}>
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
      {label}
    </div>
    {children}
  </div>
)

// ============ MOBILE ============
const MobileBoard = () => (
  <div
    style={{
      width: 390,
      height: 780,
      background: '#08090a',
      color: '#f7f8f8',
      fontFamily: 'Inter, system-ui, sans-serif',
      display: 'flex',
      flexDirection: 'column',
      borderRadius: 28,
      overflow: 'hidden',
      border: '1px solid rgba(255,255,255,0.08)',
    }}
  >
    <div
      style={{
        height: 44,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 20px',
        fontSize: 12,
        fontWeight: 600,
        color: '#f7f8f8',
      }}
    >
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>9:41</span>
      <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>●●●● 5G</span>
    </div>
    <div style={{ padding: '12px 16px 8px' }}>
      <div style={{ fontSize: 11, color: '#62666d' }}>Plan</div>
      <div style={{ fontSize: 16, fontWeight: 510, color: '#f7f8f8', letterSpacing: '-0.02em' }}>
        Q1 Launch
      </div>
    </div>
    <div style={{ display: 'flex', gap: 6, padding: '0 16px 10px', overflow: 'auto' }}>
      {['Backlog', 'To do', 'In progress', 'Review', 'Done'].map((n, i) => (
        <button
          key={n}
          style={{
            padding: '4px 10px',
            borderRadius: 6,
            background: i === 1 ? 'rgba(113,112,255,0.1)' : 'rgba(255,255,255,0.03)',
            border: `1px solid ${i === 1 ? 'rgba(113,112,255,0.3)' : 'rgba(255,255,255,0.06)'}`,
            color: i === 1 ? '#9ea2ff' : '#8a8f98',
            fontSize: 11,
            fontWeight: 510,
            whiteSpace: 'nowrap',
            fontFamily: 'inherit',
          }}
        >
          {n} {i === 1 && <span style={{ color: '#62666d' }}>7</span>}
        </button>
      ))}
    </div>
    <div
      style={{
        flex: 1,
        padding: '0 16px 16px',
        overflow: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      {PLANNER_DATA.BUCKETS[1].tasks.map((t) => (
        <TaskCard key={t.id} task={t} />
      ))}
    </div>
    <div
      style={{
        padding: '10px 16px',
        borderTop: '1px solid rgba(255,255,255,0.05)',
        display: 'flex',
        justifyContent: 'space-around',
        background: '#0f1011',
      }}
    >
      {[
        ['Day', PI.sun, true],
        ['Tasks', PI.listChecks],
        ['Plans', PI.folder],
        ['You', I.users],
      ].map(([l, ic, a], i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 3,
            color: a ? '#9ea2ff' : '#62666d',
          }}
        >
          {ic}
          <span style={{ fontSize: 9, fontWeight: 510 }}>{l}</span>
        </div>
      ))}
    </div>
  </div>
)

const MobileDetail = () => {
  const task = PLANNER_DATA.BUCKETS[1].tasks[3]
  return (
    <div
      style={{
        width: 390,
        height: 780,
        background: '#0f1011',
        color: '#f7f8f8',
        fontFamily: 'Inter, system-ui, sans-serif',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 28,
        overflow: 'hidden',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <div
        style={{
          height: 44,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 20px',
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>9:41</span>
        <span>●●●● 5G</span>
      </div>
      <div
        style={{
          padding: '8px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <span style={{ color: '#9ea2ff', fontSize: 13 }}>← Q1 Launch</span>
        <div style={{ flex: 1 }} />
        <span style={{ color: '#62666d' }}>{I.dots}</span>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <Progress value={task.progress} size={16} />
          <span style={{ fontSize: 10, fontFamily: 'IBM Plex Mono, monospace', color: '#62666d' }}>
            TASK-1038
          </span>
          <Priority level={9} />
        </div>
        <h1
          style={{
            margin: 0,
            fontSize: 18,
            fontWeight: 510,
            letterSpacing: '-0.02em',
            lineHeight: 1.35,
            marginBottom: 18,
          }}
        >
          {task.title}
        </h1>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '80px 1fr',
            gap: '10px 10px',
            fontSize: 12,
            marginBottom: 18,
          }}
        >
          <span style={{ color: '#62666d' }}>Due</span>
          <span>
            <DueBadge date={task.due} />
          </span>
          <span style={{ color: '#62666d' }}>Assignees</span>
          <span>
            <AssigneeStack ids={task.assignees} />
          </span>
          <span style={{ color: '#62666d' }}>Labels</span>
          <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {task.labels.map((s) => (
              <LabelPill key={s} slot={s} />
            ))}
          </span>
        </div>
        <div
          style={{
            fontSize: 10,
            fontWeight: 510,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: '#62666d',
            marginBottom: 6,
          }}
        >
          Checklist · 1/4
        </div>
        {[
          'Define slot model in DB',
          'Color picker component',
          'Plan settings route',
          'Edit from task card',
        ].map((t, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 0',
              fontSize: 12,
            }}
          >
            <Checkbox checked={i < 1} />
            <span
              style={{
                color: i < 1 ? '#62666d' : '#d0d6e0',
                textDecoration: i < 1 ? 'line-through' : 'none',
              }}
            >
              {t}
            </span>
          </div>
        ))}
      </div>
      <div
        style={{
          padding: '10px 16px',
          borderTop: '1px solid rgba(255,255,255,0.05)',
          display: 'flex',
          gap: 8,
        }}
      >
        <Btn variant="primary" size="md">
          Add to My Day
        </Btn>
        <Btn variant="ghost" size="md">
          Comment
        </Btn>
      </div>
    </div>
  )
}

Object.assign(window, {
  PlannerShell,
  CollapsedSidebar,
  ViewTabs,
  FilterBar,
  TaskCard,
  BoardView,
  GridView,
  Checkbox,
  ScheduleView,
  ChartsView,
  MyDayView,
  MyPlansView,
  PlanCard,
  TaskDetail,
  Section,
  MobileBoard,
  MobileDetail,
})
