// Workflow surfaces: change requests queue, onboarding kanban, org chart, reports, settings
const ChangeRequests = () => {
  const [tab, setTab] = React.useState('pending')
  const [sel, setSel] = React.useState(null)
  const reqs = PeopleData.CHANGE_REQUESTS
  const active = sel != null ? reqs[sel] : reqs[0]

  return (
    <AppShell
      active="changes"
      subtitle="Change requests"
      primary={
        <Btn variant="primary" size="md" icon={I.check}>
          Review all
        </Btn>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 420px', height: '100%' }}>
        <div>
          <div
            style={{
              display: 'flex',
              gap: 2,
              padding: '8px 16px',
              borderBottom: '1px solid rgba(255,255,255,0.05)',
            }}
          >
            {[
              ['pending', 'Pending', 5],
              ['approved', 'Approved', 42],
              ['rejected', 'Rejected', 3],
              ['all', 'All', 50],
            ].map(([id, l, c]) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                style={{
                  padding: '5px 10px',
                  borderRadius: 6,
                  background: tab === id ? 'rgba(255,255,255,0.05)' : 'transparent',
                  border: `1px solid ${tab === id ? 'rgba(255,255,255,0.08)' : 'transparent'}`,
                  color: tab === id ? '#f7f8f8' : '#8a8f98',
                  fontSize: 12,
                  fontWeight: 510,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {l}
                <span style={{ marginLeft: 6, color: '#62666d', fontSize: 10 }}>{c}</span>
              </button>
            ))}
          </div>
          <div>
            {reqs.map((r, i) => (
              <div
                key={r.id}
                onClick={() => setSel(i)}
                style={{
                  padding: '12px 16px',
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                  background: (sel ?? 0) === i ? 'rgba(113,112,255,0.04)' : 'transparent',
                  borderLeft: `2px solid ${(sel ?? 0) === i ? '#7170ff' : 'transparent'}`,
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <Avatar
                    name={r.employee.fullName}
                    initials={r.employee.initials}
                    deptColor={r.employee.deptColor}
                    size={24}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 510, color: '#f7f8f8' }}>
                      {r.employee.fullName}
                    </div>
                    <div style={{ fontSize: 11, color: '#62666d' }}>{r.employee.title}</div>
                  </div>
                  {r.priority === 'high' && <Pill variant="warning">High</Pill>}
                  <span style={{ fontSize: 10, color: '#62666d' }}>{r.age}</span>
                </div>
                <div style={{ fontSize: 12, color: '#d0d6e0', marginBottom: 4 }}>
                  <span style={{ color: '#8a8f98' }}>{r.field}:</span>{' '}
                  <span style={{ color: '#62666d', textDecoration: 'line-through' }}>{r.from}</span>{' '}
                  <span style={{ color: '#62666d' }}>→</span>{' '}
                  <span style={{ color: '#f7f8f8' }}>{r.to}</span>
                </div>
                <div style={{ fontSize: 11, color: '#8a8f98' }}>{r.reason}</div>
              </div>
            ))}
          </div>
        </div>
        <aside
          style={{
            borderLeft: '1px solid rgba(255,255,255,0.05)',
            background: '#0f1011',
            padding: 20,
            overflow: 'auto',
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 510,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: '#62666d',
              marginBottom: 12,
            }}
          >
            Request detail
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <Avatar
              name={active.employee.fullName}
              initials={active.employee.initials}
              deptColor={active.employee.deptColor}
              size={36}
            />
            <div>
              <div style={{ fontSize: 14, fontWeight: 510, color: '#f7f8f8' }}>
                {active.employee.fullName}
              </div>
              <div style={{ fontSize: 11, color: '#8a8f98' }}>
                {active.employee.title} · {active.employee.department}
              </div>
            </div>
          </div>

          <div
            style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 8,
              padding: 14,
              marginBottom: 14,
            }}
          >
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
              {active.field}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div
                style={{
                  padding: 8,
                  background: 'rgba(239,68,68,0.05)',
                  border: '1px solid rgba(239,68,68,0.15)',
                  borderRadius: 6,
                }}
              >
                <div style={{ fontSize: 9, color: '#f87171', marginBottom: 2 }}>FROM</div>
                <div style={{ fontSize: 12, color: '#d0d6e0', textDecoration: 'line-through' }}>
                  {active.from}
                </div>
              </div>
              <div
                style={{
                  padding: 8,
                  background: 'rgba(16,185,129,0.05)',
                  border: '1px solid rgba(16,185,129,0.2)',
                  borderRadius: 6,
                }}
              >
                <div style={{ fontSize: 9, color: '#34d399', marginBottom: 2 }}>TO</div>
                <div style={{ fontSize: 12, color: '#f7f8f8', fontWeight: 510 }}>{active.to}</div>
              </div>
            </div>
          </div>

          <KV label="Requested by" value={active.submitter.fullName} />
          <KV label="Reason" value={active.reason} />
          <KV label="Submitted" value={active.age + ' ago'} />
          <KV label="Request ID" value={active.id.toUpperCase()} mono />

          <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
            <Btn variant="primary" size="lg" icon={I.check}>
              Approve
            </Btn>
            <Btn variant="danger" size="lg" icon={I.x}>
              Reject
            </Btn>
            <div style={{ flex: 1 }} />
            <IconBtn title="More">{I.dots}</IconBtn>
          </div>
        </aside>
      </div>
    </AppShell>
  )
}

const Onboarding = () => {
  const stages = [
    { name: 'Offer accepted', color: '#7170ff' },
    { name: 'Paperwork', color: '#06b6d4' },
    { name: 'Equipment', color: '#f59e0b' },
    { name: 'First day ready', color: '#10b981' },
  ]
  const byStage = {
    0: [PeopleData.ONBOARDING[2]],
    1: [PeopleData.ONBOARDING[1]],
    2: [PeopleData.ONBOARDING[0]],
    3: [PeopleData.ONBOARDING[3]],
  }

  return (
    <AppShell
      active="onboarding"
      subtitle="Onboarding"
      primary={
        <Btn variant="primary" size="md" icon={I.plus}>
          New onboarding
        </Btn>
      }
    >
      <div
        style={{
          padding: 16,
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 10,
          height: '100%',
        }}
      >
        {stages.map((s, i) => (
          <div
            key={s.name}
            style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0 }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.color }} />
              <span style={{ fontSize: 12, fontWeight: 510, color: '#f7f8f8' }}>{s.name}</span>
              <span style={{ fontSize: 10, color: '#62666d' }}>{byStage[i].length}</span>
            </div>
            {byStage[i].map((o) => (
              <div
                key={o.id}
                style={{
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 8,
                  padding: 12,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <Avatar
                    name={o.employee.fullName}
                    initials={o.employee.initials}
                    deptColor={o.employee.deptColor}
                    size={28}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 510, color: '#f7f8f8' }}>
                      {o.employee.fullName}
                    </div>
                    <div style={{ fontSize: 10, color: '#62666d' }}>{o.employee.title}</div>
                  </div>
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: '#8a8f98',
                    marginBottom: 8,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                  }}
                >
                  {I.calendar}
                  {o.startDate}
                </div>
                <div
                  style={{
                    height: 3,
                    background: 'rgba(255,255,255,0.05)',
                    borderRadius: 2,
                    overflow: 'hidden',
                    marginBottom: 6,
                  }}
                >
                  <div style={{ width: o.progress + '%', height: '100%', background: s.color }} />
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 10,
                    color: '#62666d',
                  }}
                >
                  <span>
                    {o.tasks.done}/{o.tasks.total} tasks
                  </span>
                  {o.blockers > 0 && (
                    <span
                      style={{
                        color: '#fbbf24',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 3,
                      }}
                    >
                      {I.alert}
                      {o.blockers}
                    </span>
                  )}
                </div>
              </div>
            ))}
            <button
              style={{
                padding: '6px 8px',
                background: 'transparent',
                border: '1px dashed rgba(255,255,255,0.08)',
                borderRadius: 6,
                color: '#62666d',
                fontSize: 11,
                cursor: 'pointer',
                fontFamily: 'inherit',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                justifyContent: 'center',
              }}
            >
              {I.plus}Add
            </button>
          </div>
        ))}
      </div>
    </AppShell>
  )
}

const OrgChart = () => {
  const node = (name, title, initials, color, children) => ({
    name,
    title,
    initials,
    color,
    children,
  })
  const tree = node('Ana Silva', 'CEO', 'AS', '#7170ff', [
    node('Mei Chen', 'VP Engineering', 'MC', '#7170ff', [
      node('Kai Tanaka', 'Eng Manager', 'KT', '#7170ff', []),
      node('Priya Patel', 'Staff Eng', 'PP', '#7170ff', []),
      node('Diego Ribeiro', 'Staff Eng', 'DR', '#7170ff', []),
    ]),
    node('Lena Dupont', 'VP Product', 'LD', '#10b981', [
      node('Ravi Banerjee', 'Group PM', 'RB', '#10b981', []),
      node('Hiro Sato', 'Senior PM', 'HS', '#10b981', []),
    ]),
    node('Omar Hassan', 'VP Design', 'OH', '#f59e0b', [
      node('Iris Banerjee', 'Design Lead', 'IB', '#f59e0b', []),
    ]),
  ])

  const NodeCard = ({ n, depth = 0 }) => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div
        style={{
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 8,
          padding: '10px 14px',
          minWidth: 180,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <Avatar name={n.name} initials={n.initials} deptColor={n.color} size={30} />
        <div>
          <div style={{ fontSize: 12, fontWeight: 510, color: '#f7f8f8' }}>{n.name}</div>
          <div style={{ fontSize: 10, color: '#62666d' }}>{n.title}</div>
        </div>
      </div>
      {n.children && n.children.length > 0 && (
        <>
          <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.1)' }} />
          <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', position: 'relative' }}>
            {n.children.length > 1 && (
              <div
                style={{
                  position: 'absolute',
                  top: -1,
                  left: 0,
                  right: 0,
                  height: 1,
                  background: 'rgba(255,255,255,0.1)',
                }}
              />
            )}
            {n.children.map((c, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  position: 'relative',
                }}
              >
                <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.1)' }} />
                <NodeCard n={c} depth={depth + 1} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )

  return (
    <AppShell
      active="org"
      subtitle="Org chart"
      primary={
        <Btn variant="primary" size="md" icon={I.download}>
          Export
        </Btn>
      }
    >
      <div
        style={{
          padding: '10px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
          display: 'flex',
          gap: 8,
          alignItems: 'center',
        }}
      >
        <FilterChip label="Team" value="Engineering" active />
        <FilterChip label="Location" />
        <div style={{ flex: 1 }} />
        <Btn variant="ghost" size="sm" icon={I.users}>
          Compact view
        </Btn>
      </div>
      <div
        style={{
          padding: 32,
          display: 'flex',
          justifyContent: 'center',
          minHeight: 'calc(100% - 50px)',
        }}
      >
        <NodeCard n={tree} />
      </div>
    </AppShell>
  )
}

const Reports = () => {
  const cards = [
    { label: 'Headcount', value: '247', delta: '+4', deltaLabel: 'this month', color: '#7170ff' },
    { label: 'In probation', value: '14', delta: '3 ending soon', color: '#f59e0b' },
    { label: 'Open contracts', value: '31', delta: '5 expiring < 60 days', color: '#06b6d4' },
    { label: 'Completeness', value: '89%', delta: '+2% vs last month', color: '#10b981' },
  ]

  return (
    <AppShell
      active="reports"
      subtitle="Reports"
      primary={
        <Btn variant="primary" size="md" icon={I.download}>
          Export PDF
        </Btn>
      }
    >
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          {cards.map((c) => (
            <div
              key={c.label}
              style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 8,
                padding: 14,
              }}
            >
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
                {c.label}
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                <span
                  style={{
                    fontSize: 28,
                    fontWeight: 510,
                    color: '#f7f8f8',
                    letterSpacing: '-0.03em',
                  }}
                >
                  {c.value}
                </span>
                <span style={{ fontSize: 11, color: c.color }}>{c.delta}</span>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 10 }}>
          {/* Headcount trend */}
          <div
            style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 8,
              padding: 16,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 510, color: '#f7f8f8' }}>
                  Headcount trend
                </div>
                <div style={{ fontSize: 11, color: '#62666d' }}>Last 6 months</div>
              </div>
              <Pill variant="success">+11.8%</Pill>
            </div>
            <HeadcountChart />
          </div>
          <div
            style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 8,
              padding: 16,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 510, color: '#f7f8f8', marginBottom: 12 }}>
              By department
            </div>
            {PeopleData.DEPT_BREAKDOWN.map((d) => (
              <div key={d.name} style={{ marginBottom: 8 }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 11,
                    marginBottom: 3,
                  }}
                >
                  <span style={{ color: '#d0d6e0' }}>{d.name}</span>
                  <span style={{ color: '#62666d', fontFamily: 'IBM Plex Mono, monospace' }}>
                    {d.count}
                  </span>
                </div>
                <div
                  style={{
                    height: 4,
                    background: 'rgba(255,255,255,0.04)',
                    borderRadius: 2,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: d.pct * 2.5 + '%',
                      height: '100%',
                      background: 'linear-gradient(90deg, #5e6ad2, #7170ff)',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 8,
          }}
        >
          <div
            style={{
              padding: '12px 16px',
              borderBottom: '1px solid rgba(255,255,255,0.05)',
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 510, color: '#f7f8f8' }}>
              Probation ending soon
            </div>
            <Btn variant="ghost" size="sm">
              View all
            </Btn>
          </div>
          {PeopleData.EMPLOYEES.filter((e) => e.status === 'Probation')
            .slice(0, 3)
            .map((e, i) => (
              <div
                key={e.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.5fr 1fr 1fr 120px',
                  padding: '10px 16px',
                  borderTop: i > 0 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                  alignItems: 'center',
                  fontSize: 12,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Avatar
                    name={e.fullName}
                    initials={e.initials}
                    deptColor={e.deptColor}
                    size={22}
                  />
                  <span style={{ color: '#f7f8f8', fontWeight: 510 }}>{e.fullName}</span>
                </div>
                <span style={{ color: '#8a8f98' }}>{e.title}</span>
                <span style={{ color: '#8a8f98' }}>{e.department}</span>
                <Pill variant="warning">{e.probationEnds || 12} days</Pill>
              </div>
            ))}
        </div>
      </div>
    </AppShell>
  )
}

const HeadcountChart = () => {
  const data = PeopleData.HEADCOUNT
  const max = Math.max(...data.map((d) => d.value)) + 10
  const min = Math.min(...data.map((d) => d.value)) - 10
  const W = 460,
    H = 140
  const pts = data.map((d, i) => [
    20 + (i * (W - 40)) / (data.length - 1),
    H - 20 - ((d.value - min) / (max - min)) * (H - 30),
  ])
  const path = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p.join(' ')).join(' ')
  const area = path + ` L${pts[pts.length - 1][0]} ${H - 20} L${pts[0][0]} ${H - 20} Z`
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H}>
      <defs>
        <linearGradient id="hc" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#7170ff" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#7170ff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#hc)" />
      <path d={path} stroke="#7170ff" strokeWidth="1.5" fill="none" />
      {pts.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r={2.5} fill="#7170ff" />
      ))}
      {data.map((d, i) => (
        <text
          key={i}
          x={pts[i][0]}
          y={H - 4}
          fill="#62666d"
          fontSize="10"
          textAnchor="middle"
          fontFamily="Inter"
        >
          {d.month}
        </text>
      ))}
    </svg>
  )
}

const Settings = () => {
  const items = [
    ['Custom fields', 'Define org-specific profile fields', 12],
    ['Onboarding templates', 'Templates for new-hire workflows', 4],
    ['Offboarding templates', 'Templates for departure workflows', 2],
    ['Completeness rules', 'What counts as a complete profile', 8],
    ['Edit policies', 'Who can change what fields', 14],
    ['Visibility', 'Field-level access control', 9],
    ['Job catalog', 'Families, profiles, levels', 42],
    ['Countries', 'Country-specific compliance', 5],
    ['Email', 'Transactional email templates', 6],
    ['Import', 'Bulk CSV import', null],
  ]
  return (
    <AppShell active="settings" subtitle="Settings">
      <div style={{ padding: 24, maxWidth: 900 }}>
        <div style={{ marginBottom: 20 }}>
          <h2
            style={{
              margin: 0,
              fontSize: 18,
              fontWeight: 510,
              color: '#f7f8f8',
              letterSpacing: '-0.02em',
            }}
          >
            Configuration
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: '#8a8f98' }}>
            Configure the people module for your organization.
          </p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
          {items.map(([t, d, c]) => (
            <div
              key={t}
              style={{
                padding: 14,
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                cursor: 'pointer',
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 6,
                  background: 'rgba(113,112,255,0.08)',
                  border: '1px solid rgba(113,112,255,0.15)',
                  color: '#9ea2ff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {I.settings}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 510, color: '#f7f8f8' }}>{t}</div>
                <div style={{ fontSize: 11, color: '#62666d' }}>{d}</div>
              </div>
              {c != null && (
                <span
                  style={{ fontSize: 10, color: '#62666d', fontFamily: 'IBM Plex Mono, monospace' }}
                >
                  {c}
                </span>
              )}
              <span style={{ color: '#62666d' }}>{I.chevR}</span>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  )
}

// Mobile manager approval view
const MobileApproval = () => {
  const r = PeopleData.CHANGE_REQUESTS[0]
  return (
    <div
      style={{
        width: 390,
        height: 780,
        background: '#08090a',
        color: '#f7f8f8',
        fontFamily: 'Inter, system-ui, sans-serif',
        fontFeatureSettings: '"cv01","ss03"',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          height: 44,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 20px',
          fontSize: 11,
          color: '#8a8f98',
        }}
      >
        <span>9:41</span>
        <span>••• ⌐</span>
      </div>
      <header
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <IconBtn>{I.chevR}</IconBtn>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 510 }}>Change requests</div>
          <div style={{ fontSize: 10, color: '#62666d' }}>5 pending · 2 high priority</div>
        </div>
      </header>
      <div style={{ flex: 1, padding: 16, overflow: 'auto' }}>
        <div
          style={{
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 10,
            padding: 16,
            marginBottom: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <Avatar
              name={r.employee.fullName}
              initials={r.employee.initials}
              deptColor={r.employee.deptColor}
              size={40}
            />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 510 }}>{r.employee.fullName}</div>
              <div style={{ fontSize: 11, color: '#62666d' }}>{r.employee.title}</div>
            </div>
            <Pill variant="warning">High</Pill>
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
            {r.field}
          </div>
          <div
            style={{
              padding: 10,
              background: 'rgba(239,68,68,0.05)',
              border: '1px solid rgba(239,68,68,0.15)',
              borderRadius: 6,
              marginBottom: 8,
            }}
          >
            <div style={{ fontSize: 9, color: '#f87171', marginBottom: 2 }}>FROM</div>
            <div style={{ fontSize: 13, textDecoration: 'line-through', color: '#d0d6e0' }}>
              {r.from}
            </div>
          </div>
          <div
            style={{
              padding: 10,
              background: 'rgba(16,185,129,0.05)',
              border: '1px solid rgba(16,185,129,0.2)',
              borderRadius: 6,
              marginBottom: 14,
            }}
          >
            <div style={{ fontSize: 9, color: '#34d399', marginBottom: 2 }}>TO</div>
            <div style={{ fontSize: 13, fontWeight: 510 }}>{r.to}</div>
          </div>
          <div style={{ fontSize: 11, color: '#8a8f98', marginBottom: 14 }}>{r.reason}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Btn variant="danger" size="lg" icon={I.x}>
              Reject
            </Btn>
            <Btn variant="primary" size="lg" icon={I.check}>
              Approve
            </Btn>
          </div>
        </div>
        <button
          style={{
            width: '100%',
            padding: 10,
            background: 'transparent',
            border: '1px dashed rgba(255,255,255,0.08)',
            borderRadius: 8,
            color: '#62666d',
            fontSize: 11,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Swipe up for next (4 remaining)
        </button>
      </div>
    </div>
  )
}

// Mobile directory
const MobileDirectory = () => (
  <div
    style={{
      width: 390,
      height: 780,
      background: '#08090a',
      color: '#f7f8f8',
      fontFamily: 'Inter, system-ui, sans-serif',
      fontFeatureSettings: '"cv01","ss03"',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}
  >
    <div
      style={{
        height: 44,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 20px',
        fontSize: 11,
        color: '#8a8f98',
      }}
    >
      <span>9:41</span>
      <span>••• ⌐</span>
    </div>
    <header style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
      <h1 style={{ margin: 0, fontSize: 20, fontWeight: 510, letterSpacing: '-0.02em' }}>People</h1>
      <div
        style={{
          marginTop: 10,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '7px 10px',
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 8,
        }}
      >
        <span style={{ color: '#62666d' }}>{I.search}</span>
        <span style={{ fontSize: 12, color: '#62666d' }}>Search 247 people…</span>
      </div>
    </header>
    <div
      style={{
        padding: '8px 16px',
        display: 'flex',
        gap: 6,
        overflow: 'auto',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
      }}
    >
      {PeopleData.SAVED_VIEWS.slice(0, 4).map((v, i) => (
        <span
          key={v.id}
          style={{
            padding: '5px 10px',
            borderRadius: 999,
            whiteSpace: 'nowrap',
            background: i === 0 ? 'rgba(255,255,255,0.06)' : 'transparent',
            border: '1px solid rgba(255,255,255,0.08)',
            fontSize: 11,
            fontWeight: 510,
            color: i === 0 ? '#f7f8f8' : '#8a8f98',
          }}
        >
          {v.name} · {v.count}
        </span>
      ))}
    </div>
    <div style={{ flex: 1, overflow: 'auto' }}>
      {PeopleData.EMPLOYEES.slice(0, 10).map((r, i) => (
        <div
          key={r.id}
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid rgba(255,255,255,0.04)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <Avatar name={r.fullName} initials={r.initials} deptColor={r.deptColor} size={36} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 510, color: '#f7f8f8' }}>{r.fullName}</div>
            <div style={{ fontSize: 11, color: '#8a8f98' }}>
              {r.title} · {r.department}
            </div>
          </div>
          <StatusPill status={r.status} size="sm" />
        </div>
      ))}
    </div>
  </div>
)

// Command palette preview (Linear feel)
const CommandPalette = () => (
  <div
    style={{
      width: 560,
      background: '#191a1b',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 12,
      boxShadow: '0 20px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(0,0,0,0.2)',
      overflow: 'hidden',
      fontFamily: 'Inter, system-ui, sans-serif',
      fontFeatureSettings: '"cv01","ss03"',
      color: '#f7f8f8',
    }}
  >
    <div
      style={{
        padding: '14px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <span style={{ color: '#62666d' }}>{I.search}</span>
      <input
        defaultValue="diego"
        style={{
          flex: 1,
          background: 'transparent',
          border: 'none',
          outline: 'none',
          color: '#f7f8f8',
          fontSize: 14,
          fontFamily: 'inherit',
        }}
      />
      <Kbd>esc</Kbd>
    </div>
    <div style={{ padding: '6px 0' }}>
      <div
        style={{
          padding: '4px 16px',
          fontSize: 10,
          fontWeight: 510,
          color: '#62666d',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
        }}
      >
        People
      </div>
      {PeopleData.EMPLOYEES.filter((e) => e.firstName.toLowerCase().startsWith('d'))
        .slice(0, 3)
        .map((r, i) => (
          <div
            key={r.id}
            style={{
              padding: '8px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              background: i === 0 ? 'rgba(113,112,255,0.08)' : 'transparent',
            }}
          >
            <Avatar name={r.fullName} initials={r.initials} deptColor={r.deptColor} size={22} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, color: '#f7f8f8' }}>{r.fullName}</div>
              <div style={{ fontSize: 10, color: '#62666d' }}>
                {r.title} · {r.department}
              </div>
            </div>
            {i === 0 && <Kbd>↵</Kbd>}
          </div>
        ))}
      <div
        style={{
          padding: '8px 16px 4px',
          fontSize: 10,
          fontWeight: 510,
          color: '#62666d',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
        }}
      >
        Actions
      </div>
      {[
        ['Add new employee', '⌘N'],
        ['Create change request', '⌘⇧C'],
        ['Jump to onboarding', 'G O'],
      ].map(([a, k]) => (
        <div
          key={a}
          style={{ padding: '6px 16px', display: 'flex', alignItems: 'center', gap: 10 }}
        >
          <span style={{ color: '#62666d' }}>{I.plus}</span>
          <span style={{ flex: 1, fontSize: 12, color: '#d0d6e0' }}>{a}</span>
          <Kbd>{k}</Kbd>
        </div>
      ))}
    </div>
    <div
      style={{
        padding: '8px 16px',
        borderTop: '1px solid rgba(255,255,255,0.05)',
        display: 'flex',
        gap: 14,
        fontSize: 10,
        color: '#62666d',
      }}
    >
      <span>
        <Kbd>↑↓</Kbd> navigate
      </span>
      <span>
        <Kbd>↵</Kbd> open
      </span>
      <span>
        <Kbd>⌘K</Kbd> toggle
      </span>
    </div>
  </div>
)

Object.assign(window, {
  ChangeRequests,
  Onboarding,
  OrgChart,
  Reports,
  Settings,
  MobileApproval,
  MobileDirectory,
  CommandPalette,
})
