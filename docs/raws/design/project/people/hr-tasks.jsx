// Additional HR task surfaces:
// Task 02 — JobHistoryTab (timeline of role/dept/manager/comp events)
// Task 03 — RehireDialog (rehire flow overlay)
// Task 04 — DirectoryHierarchy (tree filter composer)
// Task 05 — SectionChangeRequest (approve a whole section at once)
// Task 06 — DocumentsTab (list + preview + delete)
// Task 07 — AdminCustomFields
// Task 08 — ProbationList (reminder status)
// Task 09 — AdminShareLinks (LinkedIn + public share)
// Task 10 — BulkActions (status / manager / department split confirm)
// Task 11 — AdminCompleteness (rules)
// Task: CompensationTab bonus (referenced by Profile)

// ─────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────
const HRStack = ({ children, gap = 16, ...rest }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap, ...rest.style }} {...rest}>
    {children}
  </div>
)

const HRLabel = ({ children }) => (
  <div
    style={{
      fontSize: 10,
      fontWeight: 510,
      letterSpacing: '0.06em',
      textTransform: 'uppercase',
      color: '#62666d',
    }}
  >
    {children}
  </div>
)

const HRCard = ({ title, action, children, pad = 14 }) => (
  <section
    style={{
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 8,
    }}
  >
    {title && (
      <header
        style={{
          padding: '10px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
        }}
      >
        <h3 style={{ margin: 0, fontSize: 12, fontWeight: 510, color: '#f7f8f8' }}>{title}</h3>
        {action}
      </header>
    )}
    <div style={{ padding: pad }}>{children}</div>
  </section>
)

// ─────────────────────────────────────────────────────────────
// Task 02 — Job history timeline
// ─────────────────────────────────────────────────────────────
const JobHistoryTab = ({ emp }) => {
  const events = [
    {
      type: 'promotion',
      date: 'Mar 3, 2026',
      from: 'Senior Engineer · L5',
      to: 'Staff Engineer · L6',
      by: 'Mei Chen',
      reason: 'Annual performance review — exceeds expectations for two cycles.',
    },
    {
      type: 'comp',
      date: 'Mar 3, 2026',
      from: '$142,000',
      to: '$168,000',
      by: 'Mei Chen',
      reason: 'Promotion adjustment.',
    },
    {
      type: 'manager',
      date: 'Feb 10, 2026',
      from: 'Kai Tanaka',
      to: 'Mei Chen',
      by: 'Ana Silva',
      reason: 'Reorg — Platform team moves under VP Eng.',
    },
    {
      type: 'transfer',
      date: 'Nov 2, 2025',
      from: 'Infrastructure',
      to: 'Platform',
      by: 'Kai Tanaka',
      reason: 'Internal transfer at employee request.',
    },
    {
      type: 'comp',
      date: 'Jul 15, 2024',
      from: '$128,000',
      to: '$142,000',
      by: 'Kai Tanaka',
      reason: 'Annual adjustment.',
    },
    {
      type: 'promotion',
      date: 'Jul 15, 2024',
      from: 'Engineer · L4',
      to: 'Senior Engineer · L5',
      by: 'Kai Tanaka',
      reason: 'Promotion cycle.',
    },
    {
      type: 'hire',
      date: 'Jul 15, 2023',
      from: null,
      to: 'Engineer · L4',
      by: 'Kai Tanaka',
      reason: 'Full-time hire · Engineering',
    },
  ]
  const icon = {
    promotion: { glyph: I.arrowUp, color: '#7170ff', label: 'Promotion' },
    comp: { glyph: I.dollar || I.edit, color: '#10b981', label: 'Compensation' },
    manager: { glyph: I.users, color: '#06b6d4', label: 'Manager change' },
    transfer: { glyph: I.share, color: '#f59e0b', label: 'Transfer' },
    hire: { glyph: I.plus, color: '#10b981', label: 'Hire' },
  }

  return (
    <div
      style={{
        padding: '24px 32px 48px',
        display: 'grid',
        gridTemplateColumns: '1fr 300px',
        gap: 32,
      }}
    >
      <div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 16,
          }}
        >
          <div>
            <HRLabel>Job history</HRLabel>
            <h2 style={{ margin: '4px 0 0', fontSize: 16, fontWeight: 510, color: '#f7f8f8' }}>
              {events.length} events · {Math.floor(emp.hiredDays / 30)} months
            </h2>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn variant="subtle" size="sm" icon={I.download}>
              Export
            </Btn>
            <Btn variant="primary" size="sm" icon={I.plus}>
              Add event
            </Btn>
          </div>
        </div>

        <div style={{ position: 'relative', paddingLeft: 24 }}>
          {/* timeline rail */}
          <div
            style={{
              position: 'absolute',
              left: 9,
              top: 8,
              bottom: 8,
              width: 1,
              background: 'rgba(255,255,255,0.06)',
            }}
          />
          {events.map((e, i) => {
            const m = icon[e.type]
            return (
              <div
                key={i}
                style={{ position: 'relative', paddingBottom: i === events.length - 1 ? 0 : 20 }}
              >
                <div
                  style={{
                    position: 'absolute',
                    left: -24,
                    top: 2,
                    width: 18,
                    height: 18,
                    borderRadius: 9,
                    background: '#0f1011',
                    border: `1px solid ${m.color}40`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: m.color,
                  }}
                >
                  {m.glyph}
                </div>
                <div
                  style={{
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 8,
                    padding: 12,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 510,
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        color: m.color,
                      }}
                    >
                      {m.label}
                    </span>
                    <span style={{ color: '#3e3e44' }}>·</span>
                    <span style={{ fontSize: 11, color: '#8a8f98' }}>{e.date}</span>
                    <span style={{ flex: 1 }} />
                    <span style={{ fontSize: 11, color: '#62666d' }}>by {e.by}</span>
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      color: '#f7f8f8',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      flexWrap: 'wrap',
                    }}
                  >
                    {e.from && (
                      <>
                        <span style={{ color: '#62666d', textDecoration: 'line-through' }}>
                          {e.from}
                        </span>
                        <span style={{ color: '#62666d' }}>→</span>
                      </>
                    )}
                    <span style={{ color: '#f7f8f8', fontWeight: 510 }}>{e.to}</span>
                  </div>
                  <div style={{ fontSize: 11, color: '#8a8f98', marginTop: 6 }}>{e.reason}</div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <aside style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <HRCard title="Tenure">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span
              style={{ fontSize: 24, fontWeight: 510, color: '#f7f8f8', letterSpacing: '-0.02em' }}
            >
              2
            </span>
            <span style={{ fontSize: 13, color: '#62666d' }}>years</span>
            <span style={{ fontSize: 24, fontWeight: 510, color: '#f7f8f8', marginLeft: 6 }}>
              8
            </span>
            <span style={{ fontSize: 13, color: '#62666d' }}>months</span>
          </div>
          <div style={{ fontSize: 11, color: '#62666d', marginTop: 4 }}>Since Jul 15, 2023</div>
        </HRCard>

        <HRCard title="Role progression">
          {[
            ['L4 · Engineer', 'Jul 23 — Jul 24'],
            ['L5 · Senior', 'Jul 24 — Mar 26'],
            ['L6 · Staff', 'Mar 26 — now'],
          ].map(([role, range], i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '5px 0',
                borderTop: i > 0 ? '1px solid rgba(255,255,255,0.04)' : 'none',
              }}
            >
              <div
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: i === 2 ? '#10b981' : 'rgba(255,255,255,0.2)',
                }}
              />
              <div style={{ flex: 1 }}>
                <div
                  style={{ fontSize: 12, color: '#f7f8f8', fontFamily: 'IBM Plex Mono, monospace' }}
                >
                  {role}
                </div>
                <div style={{ fontSize: 10, color: '#62666d' }}>{range}</div>
              </div>
            </div>
          ))}
        </HRCard>

        <HRCard title="Compensation trend">
          <CompMiniChart />
        </HRCard>
      </aside>
    </div>
  )
}

const CompMiniChart = () => {
  const data = [128, 128, 128, 142, 142, 168]
  const labels = ['Jul 23', 'Jan 24', 'Jul 24', 'Jul 24', 'Jan 25', 'Mar 26']
  const max = 180,
    min = 120
  const W = 240,
    H = 80
  const pts = data.map((v, i) => [
    10 + (i * (W - 20)) / (data.length - 1),
    H - 10 - ((v - min) / (max - min)) * (H - 20),
  ])
  const path = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p.join(' ')).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H}>
      <path d={path} stroke="#10b981" strokeWidth="1.5" fill="none" />
      {pts.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r={2.5} fill="#10b981" />
      ))}
      <text
        x={pts[0][0]}
        y={pts[0][1] - 6}
        fill="#62666d"
        fontSize="9"
        fontFamily="IBM Plex Mono, monospace"
        textAnchor="middle"
      >
        $128k
      </text>
      <text
        x={pts[pts.length - 1][0]}
        y={pts[pts.length - 1][1] - 6}
        fill="#10b981"
        fontSize="9"
        fontFamily="IBM Plex Mono, monospace"
        textAnchor="middle"
      >
        $168k
      </text>
    </svg>
  )
}

// ─────────────────────────────────────────────────────────────
// Task 06 — Documents tab with delete confirm
// ─────────────────────────────────────────────────────────────
const DocumentsTab = ({ emp }) => {
  const [sel, setSel] = React.useState(new Set())
  const [confirm, setConfirm] = React.useState(null)

  const docs = [
    {
      id: 'd1',
      name: 'Employment contract — 2023.pdf',
      kind: 'Contract',
      size: '248 KB',
      uploaded: 'Jul 15, 2023',
      by: 'Kai Tanaka',
      tag: 'required',
    },
    {
      id: 'd2',
      name: 'Promotion letter — L5.pdf',
      kind: 'Letter',
      size: '112 KB',
      uploaded: 'Jul 15, 2024',
      by: 'Kai Tanaka',
      tag: null,
    },
    {
      id: 'd3',
      name: 'Tax form 2024 — TD1.pdf',
      kind: 'Tax',
      size: '89 KB',
      uploaded: 'Feb 4, 2025',
      by: 'Diego Ribeiro',
      tag: 'required',
    },
    {
      id: 'd4',
      name: 'NDA — amended.pdf',
      kind: 'Legal',
      size: '176 KB',
      uploaded: 'Mar 3, 2026',
      by: 'Ana Silva',
      tag: null,
    },
    {
      id: 'd5',
      name: 'Promotion letter — L6.pdf',
      kind: 'Letter',
      size: '124 KB',
      uploaded: 'Mar 3, 2026',
      by: 'Mei Chen',
      tag: null,
    },
    {
      id: 'd6',
      name: 'Headshot — 2026.jpg',
      kind: 'Media',
      size: '2.1 MB',
      uploaded: 'Mar 5, 2026',
      by: 'Diego Ribeiro',
      tag: null,
    },
  ]
  const byKind = docs.reduce((a, d) => {
    ;(a[d.kind] = a[d.kind] || []).push(d)
    return a
  }, {})

  const toggle = (id) =>
    setSel((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  return (
    <div style={{ padding: '24px 32px 48px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
        }}
      >
        <div>
          <HRLabel>Documents</HRLabel>
          <h2 style={{ margin: '4px 0 0', fontSize: 16, fontWeight: 510, color: '#f7f8f8' }}>
            {docs.length} files · <span style={{ color: '#8a8f98', fontWeight: 400 }}>3.0 MB</span>
          </h2>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn variant="subtle" size="sm" icon={I.search}>
            Search
          </Btn>
          <Btn variant="primary" size="sm" icon={I.plus}>
            Upload
          </Btn>
        </div>
      </div>

      {/* drop zone + filters */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto',
          gap: 10,
          marginBottom: 12,
          alignItems: 'center',
        }}
      >
        <div style={{ display: 'flex', gap: 6 }}>
          <FilterChip label="Kind" value="All" active />
          <FilterChip label="Uploaded by" />
          <FilterChip label="Year" />
          <FilterChip label="Required only" />
        </div>
        <div style={{ fontSize: 11, color: '#62666d' }}>Sorted: newest first</div>
      </div>

      {/* Selection bar */}
      {sel.size > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '8px 14px',
            marginBottom: 10,
            background: 'rgba(113,112,255,0.06)',
            border: '1px solid rgba(113,112,255,0.2)',
            borderRadius: 8,
            fontSize: 12,
          }}
        >
          <span style={{ color: '#9ea2ff', fontWeight: 510 }}>{sel.size} selected</span>
          <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.08)' }} />
          <Btn variant="subtle" size="sm" icon={I.download}>
            Download
          </Btn>
          <Btn variant="subtle" size="sm" icon={I.share}>
            Share link
          </Btn>
          <Btn variant="subtle" size="sm" icon={I.tag}>
            Tag
          </Btn>
          <div style={{ flex: 1 }} />
          <button
            onClick={() => setConfirm([...sel])}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '5px 10px',
              borderRadius: 6,
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.2)',
              color: '#f87171',
              fontSize: 11,
              fontWeight: 510,
              fontFamily: 'inherit',
              cursor: 'pointer',
            }}
          >
            {I.trash || I.x} Delete
          </button>
          <button
            onClick={() => setSel(new Set())}
            style={{
              color: '#8a8f98',
              background: 'transparent',
              border: 'none',
              fontSize: 11,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Clear
          </button>
        </div>
      )}

      {/* Doc list grouped by kind */}
      <div
        style={{
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 8,
          overflow: 'hidden',
        }}
      >
        {Object.entries(byKind).map(([kind, list]) => (
          <div key={kind}>
            <div
              style={{
                padding: '8px 14px',
                background: 'rgba(255,255,255,0.015)',
                borderBottom: '1px solid rgba(255,255,255,0.04)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span style={{ color: '#62666d' }}>{I.chevD}</span>
              <span style={{ fontSize: 11, fontWeight: 510, color: '#d0d6e0' }}>{kind}</span>
              <span style={{ fontSize: 10, color: '#62666d' }}>{list.length}</span>
            </div>
            {list.map((d) => (
              <div
                key={d.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '28px minmax(280px,1.6fr) 110px 120px 1fr 36px',
                  padding: '9px 14px',
                  alignItems: 'center',
                  borderTop: '1px solid rgba(255,255,255,0.04)',
                  background: sel.has(d.id) ? 'rgba(113,112,255,0.04)' : 'transparent',
                  fontSize: 12,
                }}
              >
                <span onClick={() => toggle(d.id)} style={{ cursor: 'pointer' }}>
                  <Checkbox checked={sel.has(d.id)} />
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <DocIcon kind={d.kind} />
                  <span
                    style={{
                      fontWeight: 510,
                      color: '#f7f8f8',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {d.name}
                  </span>
                  {d.tag === 'required' && <Pill variant="accent">Required</Pill>}
                </span>
                <span
                  style={{ color: '#8a8f98', fontFamily: 'IBM Plex Mono, monospace', fontSize: 11 }}
                >
                  {d.size}
                </span>
                <span style={{ color: '#8a8f98' }}>{d.uploaded}</span>
                <span style={{ color: '#62666d', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Avatar
                    name={d.by}
                    initials={d.by
                      .split(' ')
                      .map((s) => s[0])
                      .join('')}
                    deptColor="#7170ff"
                    size={18}
                  />
                  {d.by}
                </span>
                <span style={{ display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
                  <IconBtn size={24} title="More">
                    {I.dots}
                  </IconBtn>
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>

      {confirm && (
        <DeleteConfirm
          files={confirm}
          all={docs}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            setSel(new Set())
            setConfirm(null)
          }}
        />
      )}
    </div>
  )
}

const DocIcon = ({ kind }) => {
  const c =
    { Contract: '#7170ff', Letter: '#06b6d4', Tax: '#f59e0b', Legal: '#ef4444', Media: '#10b981' }[
      kind
    ] || '#62666d'
  return (
    <div
      style={{
        width: 24,
        height: 30,
        borderRadius: 3,
        background: `${c}12`,
        border: `1px solid ${c}35`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 8,
        fontWeight: 510,
        color: c,
        fontFamily: 'IBM Plex Mono, monospace',
        flexShrink: 0,
      }}
    >
      {kind.slice(0, 3).toUpperCase()}
    </div>
  )
}

const DeleteConfirm = ({ files, all, onCancel, onConfirm }) => {
  const targets = all.filter((d) => files.includes(d.id))
  const hasRequired = targets.some((d) => d.tag === 'required')
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
      }}
    >
      <div
        style={{
          width: 440,
          background: '#191a1b',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 12,
          padding: 20,
          boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#f87171',
            }}
          >
            {I.alert}
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 510, color: '#f7f8f8' }}>
              Delete {files.length} document{files.length > 1 ? 's' : ''}?
            </div>
            <div style={{ fontSize: 11, color: '#8a8f98' }}>
              This cannot be undone. Trashed files recoverable for 30 days.
            </div>
          </div>
        </div>
        <div
          style={{
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 6,
            padding: 10,
            marginBottom: 12,
            maxHeight: 140,
            overflow: 'auto',
          }}
        >
          {targets.map((t) => (
            <div
              key={t.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '4px 0',
                fontSize: 12,
              }}
            >
              <DocIcon kind={t.kind} />
              <span style={{ flex: 1, color: '#d0d6e0' }}>{t.name}</span>
              {t.tag === 'required' && <Pill variant="warning">Required</Pill>}
            </div>
          ))}
        </div>
        {hasRequired && (
          <div
            style={{
              padding: 10,
              background: 'rgba(245,158,11,0.05)',
              border: '1px solid rgba(245,158,11,0.2)',
              borderRadius: 6,
              marginBottom: 12,
              fontSize: 11,
              color: '#fbbf24',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            {I.alert}
            <span>
              Some files are marked <b>Required</b>. Deleting drops this profile's completeness.
            </span>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Btn variant="subtle" size="md" onClick={onCancel}>
            Cancel
          </Btn>
          <Btn variant="danger" size="md" icon={I.x} onClick={onConfirm}>
            Delete {files.length}
          </Btn>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// CompensationTab (bonus — Profile references it)
// ─────────────────────────────────────────────────────────────
const CompensationTab = ({ emp }) => (
  <div
    style={{
      padding: '24px 32px 48px',
      display: 'grid',
      gridTemplateColumns: '1fr 300px',
      gap: 32,
    }}
  >
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <HRCard
        title="Current"
        action={
          <Btn variant="ghost" size="sm" icon={I.edit}>
            Adjust
          </Btn>
        }
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
          <div>
            <div
              style={{
                fontSize: 10,
                fontWeight: 510,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: '#62666d',
                marginBottom: 4,
              }}
            >
              Base salary
            </div>
            <div
              style={{ fontSize: 22, fontWeight: 510, color: '#f7f8f8', letterSpacing: '-0.02em' }}
            >
              $168,000
            </div>
            <div style={{ fontSize: 11, color: '#10b981', marginTop: 2 }}>+18.3% vs last</div>
          </div>
          <div>
            <div
              style={{
                fontSize: 10,
                fontWeight: 510,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: '#62666d',
                marginBottom: 4,
              }}
            >
              Equity
            </div>
            <div
              style={{ fontSize: 22, fontWeight: 510, color: '#f7f8f8', letterSpacing: '-0.02em' }}
            >
              $42,000
            </div>
            <div style={{ fontSize: 11, color: '#62666d', marginTop: 2 }}>4 yr, 1 yr cliff</div>
          </div>
          <div>
            <div
              style={{
                fontSize: 10,
                fontWeight: 510,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: '#62666d',
                marginBottom: 4,
              }}
            >
              Target bonus
            </div>
            <div
              style={{ fontSize: 22, fontWeight: 510, color: '#f7f8f8', letterSpacing: '-0.02em' }}
            >
              15%
            </div>
            <div style={{ fontSize: 11, color: '#62666d', marginTop: 2 }}>$25,200 @ target</div>
          </div>
        </div>
      </HRCard>

      <HRCard title="Against band">
        <CompBand />
      </HRCard>

      <HRCard title="History">
        <CompHistory />
      </HRCard>
    </div>

    <aside style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <HRCard title="Band">
        <div style={{ fontSize: 11, color: '#62666d', marginBottom: 6 }}>
          L6 Eng · San Francisco
        </div>
        <div
          style={{
            fontSize: 13,
            color: '#f7f8f8',
            fontFamily: 'IBM Plex Mono, monospace',
            marginBottom: 10,
          }}
        >
          $158k – $195k
        </div>
        <div style={{ fontSize: 11, color: '#8a8f98' }}>
          Position in band: <span style={{ color: '#10b981' }}>27%</span> — below midpoint.
        </div>
      </HRCard>
      <HRCard title="Next review">
        <div style={{ fontSize: 13, color: '#f7f8f8', marginBottom: 4 }}>Mar 3, 2027</div>
        <div style={{ fontSize: 11, color: '#62666d' }}>11 months · annual cycle</div>
      </HRCard>
      <HRCard title="Approvers">
        <div style={{ fontSize: 11, color: '#8a8f98', marginBottom: 6 }}>
          For adjustments over 10%:
        </div>
        {['Mei Chen · VP Eng', 'Ana Silva · CEO', 'Finance (automated)'].map((a, i) => (
          <div
            key={i}
            style={{
              fontSize: 11,
              color: '#d0d6e0',
              padding: '3px 0',
              borderTop: i > 0 ? '1px solid rgba(255,255,255,0.04)' : 'none',
            }}
          >
            {a}
          </div>
        ))}
      </HRCard>
    </aside>
  </div>
)

const CompBand = () => {
  const min = 158,
    max = 195,
    salary = 168
  const pct = ((salary - min) / (max - min)) * 100
  return (
    <div>
      <div style={{ position: 'relative', height: 40 }}>
        <div
          style={{
            position: 'absolute',
            inset: '14px 0',
            background:
              'linear-gradient(90deg, rgba(239,68,68,0.15), rgba(245,158,11,0.15), rgba(16,185,129,0.15))',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 6,
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: 12,
            bottom: 12,
            left: '50%',
            width: 1,
            background: 'rgba(255,255,255,0.2)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: 8,
            bottom: 8,
            left: pct + '%',
            width: 3,
            background: '#10b981',
            borderRadius: 2,
            boxShadow: '0 0 8px rgba(16,185,129,0.5)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: -4,
            left: pct + '%',
            transform: 'translateX(-50%)',
            fontSize: 11,
            fontWeight: 510,
            color: '#10b981',
            whiteSpace: 'nowrap',
          }}
        >
          ${salary}k
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 10,
          color: '#62666d',
          marginTop: 2,
          fontFamily: 'IBM Plex Mono, monospace',
        }}
      >
        <span>${min}k min</span>
        <span>${Math.round((min + max) / 2)}k mid</span>
        <span>${max}k max</span>
      </div>
    </div>
  )
}

const CompHistory = () => {
  const rows = [
    ['Mar 3, 2026', 'Promotion to L6', '$142,000', '$168,000', '+18.3%'],
    ['Jan 1, 2025', 'Annual adjust', '$135,000', '$142,000', '+5.2%'],
    ['Jul 15, 2024', 'Promotion to L5', '$128,000', '$135,000', '+5.5%'],
    ['Jul 15, 2023', 'Hired', '—', '$128,000', '—'],
  ]
  return (
    <div>
      {rows.map((r, i) => (
        <div
          key={i}
          style={{
            display: 'grid',
            gridTemplateColumns: '100px 1.4fr 1fr 1fr 80px',
            padding: '8px 0',
            borderTop: i > 0 ? '1px solid rgba(255,255,255,0.04)' : 'none',
            fontSize: 12,
          }}
        >
          <span style={{ color: '#8a8f98' }}>{r[0]}</span>
          <span style={{ color: '#d0d6e0' }}>{r[1]}</span>
          <span style={{ color: '#62666d', fontFamily: 'IBM Plex Mono, monospace', fontSize: 11 }}>
            {r[2]}
          </span>
          <span style={{ color: '#f7f8f8', fontFamily: 'IBM Plex Mono, monospace', fontSize: 11 }}>
            {r[3]}
          </span>
          <span
            style={{
              color: r[4].startsWith('+') ? '#10b981' : '#62666d',
              textAlign: 'right',
              fontFamily: 'IBM Plex Mono, monospace',
              fontSize: 11,
            }}
          >
            {r[4]}
          </span>
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Task 03 — Rehire dialog
// ─────────────────────────────────────────────────────────────
const RehireDialog = ({ emp }) => (
  <div
    style={{
      position: 'absolute',
      inset: 0,
      background: 'rgba(0,0,0,0.6)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 50,
    }}
  >
    <div
      style={{
        width: 560,
        background: '#0f1011',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 12,
        boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '14px 20px',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <Avatar name={emp.fullName} initials={emp.initials} deptColor={emp.deptColor} size={28} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 510, color: '#f7f8f8' }}>
            Rehire {emp.firstName}
          </div>
          <div style={{ fontSize: 11, color: '#62666d' }}>
            Previously {emp.title} · left Mar 12, 2026
          </div>
        </div>
        <IconBtn>{I.x}</IconBtn>
      </div>

      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div
          style={{
            padding: 12,
            background: 'rgba(113,112,255,0.04)',
            border: '1px solid rgba(113,112,255,0.15)',
            borderRadius: 6,
            fontSize: 11,
            color: '#d0d6e0',
            lineHeight: 1.55,
          }}
        >
          <b style={{ color: '#9ea2ff' }}>History preserved.</b> Rehire re-activates the existing
          record, keeping prior job history, documents, and comp. Fields below may be updated.
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <HRField label="Start date" value="Apr 1, 2026" />
          <HRField label="Employment type" value="Full-time" />
          <HRField label="Job title" value={emp.title} />
          <HRField label="Level" value={emp.level} mono />
          <HRField label="Department" value={emp.department} />
          <HRField label="Manager" value="Mei Chen" />
          <HRField label="Location" value={emp.location} />
          <HRField label="Employee ID" value="E-0087" mono locked subtext="From previous record" />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 11, color: '#62666d' }}>Onboarding</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {['Skip (rehire)', 'Lightweight', 'Full onboarding'].map((o, i) => (
              <div
                key={o}
                style={{
                  flex: 1,
                  padding: '8px 10px',
                  background: i === 0 ? 'rgba(113,112,255,0.06)' : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${i === 0 ? 'rgba(113,112,255,0.3)' : 'rgba(255,255,255,0.06)'}`,
                  borderRadius: 6,
                  fontSize: 12,
                  color: i === 0 ? '#f7f8f8' : '#8a8f98',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontWeight: 510 }}>{o}</div>
                <div style={{ fontSize: 10, color: '#62666d', marginTop: 2 }}>
                  {i === 0 ? 'Re-activate only' : i === 1 ? 'Docs + equipment' : 'Same as new hire'}
                </div>
              </div>
            ))}
          </div>
        </div>

        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 12,
            color: '#d0d6e0',
            cursor: 'pointer',
          }}
        >
          <Checkbox checked /> Notify {emp.firstName} via email that their account is reactivating.
        </label>
      </div>

      <div
        style={{
          padding: 14,
          borderTop: '1px solid rgba(255,255,255,0.05)',
          display: 'flex',
          gap: 8,
          justifyContent: 'flex-end',
          background: 'rgba(255,255,255,0.015)',
        }}
      >
        <Btn variant="subtle" size="md">
          Cancel
        </Btn>
        <Btn variant="primary" size="md" icon={I.check}>
          Rehire & reactivate
        </Btn>
      </div>
    </div>
  </div>
)

const HRField = ({ label, value, mono, locked, subtext }) => (
  <div>
    <div
      style={{
        fontSize: 10,
        fontWeight: 510,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: '#62666d',
        marginBottom: 4,
      }}
    >
      {label}
    </div>
    <div
      style={{
        padding: '7px 10px',
        background: locked ? 'rgba(255,255,255,0.01)' : 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 6,
        fontSize: 12,
        color: locked ? '#62666d' : '#f7f8f8',
        fontFamily: mono ? 'IBM Plex Mono, monospace' : 'inherit',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}
    >
      {locked && <span style={{ color: '#62666d' }}>{I.lock}</span>}
      {value}
    </div>
    {subtext && <div style={{ fontSize: 10, color: '#62666d', marginTop: 3 }}>{subtext}</div>}
  </div>
)

// ─────────────────────────────────────────────────────────────
// Task 04 — Directory hierarchy filter
// ─────────────────────────────────────────────────────────────
const DirectoryHierarchyFilter = () => {
  const [expanded, setExpanded] = React.useState({ Eng: true, 'Eng/Platform': true })
  const [checked, setChecked] = React.useState({ 'Eng/Platform': true, 'Eng/Platform/Infra': true })

  const tree = [
    {
      id: 'Eng',
      name: 'Engineering',
      count: 98,
      children: [
        {
          id: 'Eng/Platform',
          name: 'Platform',
          count: 34,
          children: [
            { id: 'Eng/Platform/Infra', name: 'Infrastructure', count: 14 },
            { id: 'Eng/Platform/Data', name: 'Data Platform', count: 12 },
            { id: 'Eng/Platform/Sec', name: 'Security', count: 8 },
          ],
        },
        {
          id: 'Eng/Product',
          name: 'Product Eng',
          count: 42,
          children: [
            { id: 'Eng/Product/Web', name: 'Web', count: 18 },
            { id: 'Eng/Product/Mob', name: 'Mobile', count: 14 },
            { id: 'Eng/Product/API', name: 'API', count: 10 },
          ],
        },
        { id: 'Eng/ML', name: 'ML', count: 22 },
      ],
    },
    {
      id: 'Product',
      name: 'Product',
      count: 34,
      children: [
        { id: 'Product/PM', name: 'Product Management', count: 18 },
        { id: 'Product/Research', name: 'Research', count: 8 },
        { id: 'Product/Ops', name: 'Ops', count: 8 },
      ],
    },
    { id: 'Design', name: 'Design', count: 24 },
    { id: 'Sales', name: 'Sales', count: 42 },
    { id: 'Ops', name: 'People & Ops', count: 18 },
  ]

  return (
    <div
      style={{
        position: 'absolute',
        top: 112,
        left: 225,
        width: 420,
        background: '#0f1011',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 10,
        boxShadow: '0 12px 32px rgba(0,0,0,0.4)',
        overflow: 'hidden',
        zIndex: 40,
      }}
    >
      <div
        style={{
          padding: '10px 14px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <span style={{ color: '#62666d' }}>{I.search}</span>
        <input
          autoFocus
          placeholder="Filter departments…"
          defaultValue=""
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: '#f7f8f8',
            fontSize: 13,
            fontFamily: 'inherit',
          }}
        />
        <Kbd>/</Kbd>
      </div>

      <div style={{ padding: '8px 6px', maxHeight: 420, overflow: 'auto' }}>
        <div
          style={{
            padding: '4px 10px 8px',
            fontSize: 10,
            fontWeight: 510,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: '#62666d',
          }}
        >
          Departments · hierarchy
        </div>
        {tree.map((node) => (
          <TreeNode
            key={node.id}
            node={node}
            depth={0}
            expanded={expanded}
            setExpanded={setExpanded}
            checked={checked}
            setChecked={setChecked}
          />
        ))}
      </div>

      <div
        style={{
          padding: '8px 14px',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: 'rgba(255,255,255,0.02)',
        }}
      >
        <div style={{ flex: 1, fontSize: 11, color: '#8a8f98' }}>
          <span style={{ color: '#9ea2ff', fontWeight: 510 }}>Platform</span> (34 people) · includes
          all sub-teams
        </div>
        <Btn variant="subtle" size="sm">
          Clear
        </Btn>
        <Btn variant="primary" size="sm" icon={I.check}>
          Apply
        </Btn>
      </div>

      <div
        style={{
          padding: '8px 14px',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          fontSize: 10,
          color: '#62666d',
          background: 'rgba(0,0,0,0.2)',
          display: 'flex',
          gap: 12,
        }}
      >
        <span>
          <Kbd>↑↓</Kbd> move
        </span>
        <span>
          <Kbd>→</Kbd> expand
        </span>
        <span>
          <Kbd>space</Kbd> toggle
        </span>
        <span>
          <Kbd>↵</Kbd> apply
        </span>
      </div>
    </div>
  )
}

const TreeNode = ({ node, depth, expanded, setExpanded, checked, setChecked }) => {
  const hasChildren = node.children && node.children.length > 0
  const isOpen = expanded[node.id]
  const isChecked = checked[node.id]
  const descendantChecked =
    hasChildren && node.children.some((c) => checked[c.id] || checkedDeep(c, checked))

  const toggleExpand = () => setExpanded((e) => ({ ...e, [node.id]: !e[node.id] }))
  const toggleCheck = () => setChecked((c) => ({ ...c, [node.id]: !c[node.id] }))

  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '5px 10px',
          paddingLeft: 10 + depth * 16,
          borderRadius: 6,
          background: isChecked ? 'rgba(113,112,255,0.08)' : 'transparent',
          cursor: 'pointer',
        }}
      >
        <button
          onClick={toggleExpand}
          disabled={!hasChildren}
          style={{
            width: 14,
            height: 14,
            padding: 0,
            background: 'transparent',
            border: 'none',
            color: hasChildren ? '#8a8f98' : 'transparent',
            cursor: hasChildren ? 'pointer' : 'default',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
            transition: 'transform 120ms',
          }}
        >
          {I.chevD}
        </button>
        <span onClick={toggleCheck}>
          <Checkbox checked={isChecked || (descendantChecked && !isChecked)} />
        </span>
        <span
          onClick={toggleCheck}
          style={{
            flex: 1,
            fontSize: 12,
            color: isChecked ? '#f7f8f8' : '#d0d6e0',
            fontWeight: isChecked ? 510 : 400,
          }}
        >
          {node.name}
        </span>
        <span style={{ fontSize: 10, color: '#62666d', fontFamily: 'IBM Plex Mono, monospace' }}>
          {node.count}
        </span>
      </div>
      {hasChildren &&
        isOpen &&
        node.children.map((c) => (
          <TreeNode
            key={c.id}
            node={c}
            depth={depth + 1}
            expanded={expanded}
            setExpanded={setExpanded}
            checked={checked}
            setChecked={setChecked}
          />
        ))}
    </>
  )
}

const checkedDeep = (node, checked) => {
  if (!node.children) return false
  return node.children.some((c) => checked[c.id] || checkedDeep(c, checked))
}

// ─────────────────────────────────────────────────────────────
// Task 05 — Section-level change request
// ─────────────────────────────────────────────────────────────
const SectionChangeRequest = () => {
  const emp = PeopleData.EMPLOYEES[3]
  const changes = [
    { field: 'Phone', from: '+84 90 123 4567', to: '+84 91 987 6543', kind: 'replace' },
    { field: 'Personal email', from: 'diego.r@gmail.com', to: 'd.ribeiro@pm.me', kind: 'replace' },
    {
      field: 'Address line 1',
      from: '12 Nguyen Du St.',
      to: '84 Tran Hung Dao St.',
      kind: 'replace',
    },
    { field: 'City', from: 'Hanoi', to: 'Ho Chi Minh City', kind: 'replace' },
    { field: 'Postal code', from: '100000', to: '700000', kind: 'replace' },
    {
      field: 'Emergency contact #2',
      from: null,
      to: 'Lucas Ribeiro · Brother · +84 93 111 2222',
      kind: 'add',
    },
  ]

  return (
    <AppShell
      active="changes"
      subtitle={
        <span>
          Change requests <span style={{ color: '#62666d', margin: '0 4px' }}>/</span> CR-0041
        </span>
      }
      primary={
        <>
          <Btn variant="danger" size="md" icon={I.x}>
            Reject section
          </Btn>
          <Btn variant="primary" size="md" icon={I.check}>
            Approve all
          </Btn>
        </>
      }
    >
      <div style={{ padding: 32, display: 'grid', gridTemplateColumns: '1fr 320px', gap: 28 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <Avatar
              name={emp.fullName}
              initials={emp.initials}
              deptColor={emp.deptColor}
              size={40}
            />
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 510,
                  color: '#f7f8f8',
                  letterSpacing: '-0.02em',
                }}
              >
                Personal information update
              </div>
              <div style={{ fontSize: 12, color: '#8a8f98' }}>
                {emp.fullName} · {emp.title} · submitted 2 days ago
              </div>
            </div>
            <Pill variant="accent">Section request</Pill>
          </div>

          <div
            style={{
              padding: 12,
              background: 'rgba(113,112,255,0.04)',
              border: '1px solid rgba(113,112,255,0.2)',
              borderRadius: 8,
              marginBottom: 16,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <span style={{ color: '#9ea2ff' }}>{I.users}</span>
            <div style={{ flex: 1, fontSize: 12, color: '#d0d6e0', lineHeight: 1.5 }}>
              {emp.firstName} is updating the entire{' '}
              <b style={{ color: '#f7f8f8' }}>Personal info</b> section. You can approve all{' '}
              {changes.length} fields at once, or handle each individually.
            </div>
          </div>

          <div
            style={{
              fontSize: 11,
              fontWeight: 510,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: '#62666d',
              margin: '4px 2px 10px',
            }}
          >
            {changes.length} fields changing
          </div>

          <div
            style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 8,
              overflow: 'hidden',
            }}
          >
            {changes.map((c, i) => (
              <div
                key={c.field}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '160px 1fr 40px',
                  padding: '12px 16px',
                  gap: 12,
                  borderTop: i > 0 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ fontSize: 12, color: '#f7f8f8', fontWeight: 510 }}>{c.field}</div>
                  <div style={{ fontSize: 10, color: '#62666d', marginTop: 2 }}>
                    {c.kind === 'add' ? 'New entry' : 'Updating'}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  {c.from ? (
                    <span
                      style={{
                        fontSize: 12,
                        color: '#62666d',
                        textDecoration: 'line-through',
                        flex: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {c.from}
                    </span>
                  ) : (
                    <span style={{ fontSize: 11, color: '#62666d', fontStyle: 'italic', flex: 1 }}>
                      — empty —
                    </span>
                  )}
                  <span style={{ color: '#62666d' }}>→</span>
                  <span
                    style={{
                      fontSize: 12,
                      color: '#f7f8f8',
                      flex: 1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {c.to}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 3, justifyContent: 'flex-end' }}>
                  <IconBtn size={24} title="Approve this field">
                    {I.check}
                  </IconBtn>
                  <IconBtn size={24} title="Reject this field">
                    {I.x}
                  </IconBtn>
                </div>
              </div>
            ))}
          </div>

          <div
            style={{
              marginTop: 16,
              padding: 12,
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 8,
            }}
          >
            <div style={{ fontSize: 11, color: '#62666d', marginBottom: 6 }}>
              Reason from {emp.firstName}
            </div>
            <div style={{ fontSize: 12, color: '#d0d6e0', lineHeight: 1.5 }}>
              Relocated to Ho Chi Minh City and switched mobile plans. Adding my brother as a second
              emergency contact.
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 510,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: '#62666d',
                marginBottom: 8,
              }}
            >
              Approval note
            </div>
            <div
              style={{
                padding: 10,
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 6,
                fontSize: 12,
                color: '#62666d',
                minHeight: 60,
              }}
            >
              Add a note visible to {emp.firstName}…
            </div>
          </div>
        </div>

        <aside style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <HRCard title="Approval chain">
            {[
              { name: 'Ops automation', role: 'Policy check', status: 'passed' },
              { name: 'Mei Chen', role: 'Manager', status: 'you' },
              { name: 'People team', role: 'Record of update', status: 'auto' },
            ].map((s, i) => (
              <div
                key={s.name}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 0',
                  borderTop: i > 0 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                }}
              >
                <div
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    background:
                      s.status === 'passed'
                        ? 'rgba(16,185,129,0.15)'
                        : s.status === 'you'
                          ? 'rgba(113,112,255,0.15)'
                          : 'rgba(255,255,255,0.05)',
                    color:
                      s.status === 'passed'
                        ? '#34d399'
                        : s.status === 'you'
                          ? '#9ea2ff'
                          : '#8a8f98',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 10,
                    fontWeight: 510,
                  }}
                >
                  {s.status === 'passed' ? I.check : i + 1}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: '#f7f8f8', fontWeight: 510 }}>{s.name}</div>
                  <div style={{ fontSize: 10, color: '#62666d' }}>{s.role}</div>
                </div>
                {s.status === 'you' && <Pill variant="accent">You</Pill>}
              </div>
            ))}
          </HRCard>

          <HRCard title="Request details">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#62666d' }}>ID</span>
                <span style={{ color: '#d0d6e0', fontFamily: 'IBM Plex Mono, monospace' }}>
                  CR-0041
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#62666d' }}>Section</span>
                <span style={{ color: '#d0d6e0' }}>Personal info</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#62666d' }}>Submitted</span>
                <span style={{ color: '#d0d6e0' }}>Mar 20, 10:42 AM</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#62666d' }}>SLA</span>
                <span style={{ color: '#fbbf24' }}>2 days left</span>
              </div>
            </div>
          </HRCard>

          <HRCard title="Prior changes by {name}" action={null}>
            <div style={{ fontSize: 11, color: '#62666d' }}>
              4 approved · 0 rejected · last Feb 10, 2026
            </div>
          </HRCard>
        </aside>
      </div>
    </AppShell>
  )
}

// ─────────────────────────────────────────────────────────────
// Task 08 — Probationary employees list
// ─────────────────────────────────────────────────────────────
const ProbationList = () => {
  const rows = [
    {
      name: 'Yuki Tanaka',
      title: 'Software Engineer',
      dept: 'Engineering',
      initials: 'YT',
      color: '#7170ff',
      hired: 'Feb 1, 2026',
      ends: 'May 1, 2026',
      daysLeft: 4,
      reminder: 'overdue',
      manager: 'Mei Chen',
    },
    {
      name: 'Lina Svensson',
      title: 'Product Designer',
      dept: 'Design',
      initials: 'LS',
      color: '#f59e0b',
      hired: 'Feb 15, 2026',
      ends: 'May 15, 2026',
      daysLeft: 18,
      reminder: 'sent',
      manager: 'Omar Hassan',
    },
    {
      name: 'Marcus Vega',
      title: 'Product Manager',
      dept: 'Product',
      initials: 'MV',
      color: '#10b981',
      hired: 'Mar 1, 2026',
      ends: 'Jun 1, 2026',
      daysLeft: 35,
      reminder: 'scheduled',
      manager: 'Lena Dupont',
    },
    {
      name: 'Anika Sharma',
      title: 'Data Engineer',
      dept: 'Engineering',
      initials: 'AS',
      color: '#7170ff',
      hired: 'Mar 10, 2026',
      ends: 'Jun 10, 2026',
      daysLeft: 44,
      reminder: 'scheduled',
      manager: 'Mei Chen',
    },
    {
      name: 'Tobias Krüger',
      title: 'Sales Rep',
      dept: 'Sales',
      initials: 'TK',
      color: '#06b6d4',
      hired: 'Mar 18, 2026',
      ends: 'Jun 18, 2026',
      daysLeft: 52,
      reminder: 'scheduled',
      manager: 'Sofia Rossi',
    },
    {
      name: 'Elena Costa',
      title: 'Recruiter',
      dept: 'People',
      initials: 'EC',
      color: '#ec4899',
      hired: 'Apr 2, 2026',
      ends: 'Jul 2, 2026',
      daysLeft: 66,
      reminder: 'scheduled',
      manager: 'Iris Banerjee',
    },
  ]

  const reminder = {
    overdue: { color: '#ef4444', bg: 'rgba(239,68,68,0.1)', label: 'Overdue · 4d' },
    sent: { color: '#10b981', bg: 'rgba(16,185,129,0.1)', label: 'Sent · Apr 15' },
    scheduled: { color: '#8a8f98', bg: 'rgba(255,255,255,0.05)', label: 'Scheduled' },
  }

  return (
    <AppShell
      active="reports"
      subtitle={
        <span>
          Reports <span style={{ color: '#62666d', margin: '0 4px' }}>/</span> Probation
        </span>
      }
      primary={
        <Btn variant="primary" size="md" icon={I.mail}>
          Send reminders · 1
        </Btn>
      }
    >
      <div style={{ padding: 24 }}>
        {/* Top stats */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 10,
            marginBottom: 16,
          }}
        >
          {[
            { label: 'In probation', value: rows.length, sub: 'across 4 depts', color: '#d0d6e0' },
            { label: 'Ending < 30 days', value: 2, sub: 'Review needed', color: '#fbbf24' },
            { label: 'Reminders overdue', value: 1, sub: 'Action required', color: '#ef4444' },
            { label: 'Auto-reminders on', value: '5', sub: 'Day 60 + day 75', color: '#10b981' },
          ].map((c) => (
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
              <div
                style={{
                  fontSize: 24,
                  fontWeight: 510,
                  color: '#f7f8f8',
                  letterSpacing: '-0.02em',
                }}
              >
                {c.value}
              </div>
              <div style={{ fontSize: 11, color: c.color, marginTop: 2 }}>{c.sub}</div>
            </div>
          ))}
        </div>

        {/* Filter row */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          <FilterChip label="Ends in" value="< 90 days" active />
          <FilterChip label="Department" />
          <FilterChip label="Reminder" value="All" active />
          <FilterChip label="Manager" />
        </div>

        {/* List */}
        <div
          style={{
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 8,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1.6fr 1fr 0.9fr 160px 160px 120px',
              padding: '8px 16px',
              fontSize: 10,
              fontWeight: 510,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: '#62666d',
              borderBottom: '1px solid rgba(255,255,255,0.05)',
            }}
          >
            <span>Person</span>
            <span>Manager</span>
            <span>Hired</span>
            <span>Probation ends</span>
            <span>Reminder</span>
            <span style={{ textAlign: 'right' }}>Action</span>
          </div>
          {rows.map((r, i) => {
            const rem = reminder[r.reminder]
            const daysColor = r.daysLeft < 7 ? '#ef4444' : r.daysLeft < 30 ? '#fbbf24' : '#8a8f98'
            return (
              <div
                key={r.name}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.6fr 1fr 0.9fr 160px 160px 120px',
                  padding: '11px 16px',
                  alignItems: 'center',
                  borderTop: i > 0 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                  fontSize: 12,
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Avatar name={r.name} initials={r.initials} deptColor={r.color} size={28} />
                  <div>
                    <div style={{ color: '#f7f8f8', fontWeight: 510 }}>{r.name}</div>
                    <div style={{ color: '#62666d', fontSize: 11 }}>
                      {r.title} · {r.dept}
                    </div>
                  </div>
                </span>
                <span style={{ color: '#d0d6e0' }}>{r.manager}</span>
                <span style={{ color: '#8a8f98' }}>{r.hired}</span>
                <span>
                  <div style={{ color: '#d0d6e0', fontSize: 12 }}>{r.ends}</div>
                  <div
                    style={{
                      color: daysColor,
                      fontSize: 11,
                      fontFamily: 'IBM Plex Mono, monospace',
                    }}
                  >
                    in {r.daysLeft}d
                  </div>
                </span>
                <span>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      padding: '3px 8px',
                      borderRadius: 4,
                      background: rem.bg,
                      color: rem.color,
                      fontSize: 11,
                      fontWeight: 510,
                    }}
                  >
                    <span
                      style={{ width: 5, height: 5, borderRadius: '50%', background: rem.color }}
                    />
                    {rem.label}
                  </span>
                </span>
                <span style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                  <Btn variant="subtle" size="sm">
                    Review
                  </Btn>
                  <IconBtn size={26}>{I.dots}</IconBtn>
                </span>
              </div>
            )
          })}
        </div>

        {/* Reminder policy */}
        <div
          style={{
            marginTop: 16,
            padding: 14,
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 8,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ color: '#9ea2ff' }}>{I.settings}</span>
            <span style={{ fontSize: 12, fontWeight: 510, color: '#f7f8f8' }}>Reminder policy</span>
            <span style={{ flex: 1 }} />
            <Btn variant="ghost" size="sm">
              Configure
            </Btn>
          </div>
          <div style={{ fontSize: 11, color: '#8a8f98', lineHeight: 1.6 }}>
            Managers are notified <b style={{ color: '#d0d6e0' }}>30 days</b> before probation ends
            and again at <b style={{ color: '#d0d6e0' }}>15 days</b>. A decision is required by day
            85.
          </div>
        </div>
      </div>
    </AppShell>
  )
}

// ─────────────────────────────────────────────────────────────
// Task 07 — Admin: Custom fields
// ─────────────────────────────────────────────────────────────
const AdminCustomFields = () => {
  const fields = [
    {
      name: 'T-shirt size',
      section: 'Personal',
      type: 'select',
      required: false,
      vis: 'Employee',
      count: 247,
    },
    {
      name: 'Dietary preferences',
      section: 'Personal',
      type: 'multi-select',
      required: false,
      vis: 'Employee',
      count: 231,
    },
    {
      name: 'Work visa status',
      section: 'Employment',
      type: 'select',
      required: true,
      vis: 'HR only',
      count: 89,
    },
    {
      name: 'Emergency medical',
      section: 'Personal',
      type: 'long text',
      required: false,
      vis: 'HR only',
      count: 156,
    },
    {
      name: 'Certifications',
      section: 'Career',
      type: 'repeater',
      required: false,
      vis: 'Manager+',
      count: 142,
    },
    {
      name: 'Preferred pronouns',
      section: 'Personal',
      type: 'text',
      required: false,
      vis: 'Everyone',
      count: 198,
    },
    {
      name: 'Languages spoken',
      section: 'Career',
      type: 'multi-select',
      required: false,
      vis: 'Everyone',
      count: 201,
    },
  ]

  return (
    <AppShell
      active="settings"
      subtitle={
        <span>
          Settings <span style={{ color: '#62666d', margin: '0 4px' }}>/</span> Custom fields
        </span>
      }
      primary={
        <Btn variant="primary" size="md" icon={I.plus}>
          New field
        </Btn>
      }
    >
      <div style={{ padding: 24 }}>
        <div style={{ marginBottom: 14 }}>
          <h2
            style={{
              margin: 0,
              fontSize: 18,
              fontWeight: 510,
              color: '#f7f8f8',
              letterSpacing: '-0.02em',
            }}
          >
            Custom fields
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: '#8a8f98' }}>
            Org-specific fields on employee profiles. {fields.length} in use.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20 }}>
          {/* Field list */}
          <div
            style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 8,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '20px 1.4fr 0.9fr 0.9fr 80px 1fr 80px 28px',
                padding: '8px 14px',
                fontSize: 10,
                fontWeight: 510,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                color: '#62666d',
                borderBottom: '1px solid rgba(255,255,255,0.05)',
              }}
            >
              <span />
              <span>Field</span>
              <span>Section</span>
              <span>Type</span>
              <span>Required</span>
              <span>Visible to</span>
              <span>Filled</span>
              <span />
            </div>
            {fields.map((f, i) => (
              <div
                key={f.name}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '20px 1.4fr 0.9fr 0.9fr 80px 1fr 80px 28px',
                  padding: '10px 14px',
                  alignItems: 'center',
                  borderTop: i > 0 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                  fontSize: 12,
                  background: i === 0 ? 'rgba(113,112,255,0.03)' : 'transparent',
                }}
              >
                <span style={{ color: '#3e3e44', cursor: 'grab' }}>⋮⋮</span>
                <span style={{ color: '#f7f8f8', fontWeight: 510 }}>{f.name}</span>
                <span style={{ color: '#8a8f98' }}>{f.section}</span>
                <span
                  style={{ fontFamily: 'IBM Plex Mono, monospace', color: '#d0d6e0', fontSize: 11 }}
                >
                  {f.type}
                </span>
                <span>
                  {f.required ? (
                    <Pill variant="warning">Yes</Pill>
                  ) : (
                    <span style={{ color: '#62666d' }}>—</span>
                  )}
                </span>
                <span style={{ color: '#8a8f98', fontSize: 11 }}>{f.vis}</span>
                <span
                  style={{ color: '#d0d6e0', fontFamily: 'IBM Plex Mono, monospace', fontSize: 11 }}
                >
                  {f.count}/247
                </span>
                <IconBtn size={22}>{I.dots}</IconBtn>
              </div>
            ))}
          </div>

          {/* Editor */}
          <aside
            style={{
              background: '#0f1011',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 10,
              padding: 16,
              alignSelf: 'start',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <span style={{ color: '#9ea2ff' }}>{I.edit}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 510, color: '#f7f8f8' }}>T-shirt size</div>
                <div style={{ fontSize: 10, color: '#62666d' }}>Editing · unsaved changes</div>
              </div>
              <IconBtn size={22}>{I.x}</IconBtn>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <HRField label="Name" value="T-shirt size" />
              <HRField label="Section" value="Personal" />
              <HRField label="Type" value="Single select" mono />
              <div>
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
                  Options
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {['XS', 'S', 'M', 'L', 'XL', 'XXL'].map((o) => (
                    <span
                      key={o}
                      style={{
                        padding: '3px 8px',
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: 4,
                        fontSize: 11,
                        color: '#d0d6e0',
                        fontFamily: 'IBM Plex Mono, monospace',
                      }}
                    >
                      {o} <span style={{ color: '#62666d', marginLeft: 4 }}>✕</span>
                    </span>
                  ))}
                  <button
                    style={{
                      padding: '3px 8px',
                      background: 'transparent',
                      border: '1px dashed rgba(255,255,255,0.1)',
                      borderRadius: 4,
                      fontSize: 11,
                      color: '#62666d',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    + Add
                  </button>
                </div>
              </div>
              <div>
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
                  Permissions
                </div>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 5,
                    fontSize: 12,
                    color: '#d0d6e0',
                  }}
                >
                  {[
                    ['Self', 'Can edit'],
                    ['Manager', 'Can view'],
                    ['HR', 'Full access'],
                    ['Everyone else', 'Hidden'],
                  ].map(([role, perm]) => (
                    <div
                      key={role}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        padding: '4px 8px',
                        background: 'rgba(255,255,255,0.02)',
                        border: '1px solid rgba(255,255,255,0.05)',
                        borderRadius: 4,
                      }}
                    >
                      <span>{role}</span>
                      <span style={{ color: '#8a8f98', fontSize: 11 }}>{perm}</span>
                    </div>
                  ))}
                </div>
              </div>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 12,
                  color: '#d0d6e0',
                }}
              >
                <Checkbox /> Required field
              </label>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 12,
                  color: '#d0d6e0',
                }}
              >
                <Checkbox checked /> Include in completeness
              </label>
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <Btn variant="subtle" size="md">
                  Discard
                </Btn>
                <Btn variant="primary" size="md" icon={I.check}>
                  Save field
                </Btn>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </AppShell>
  )
}

// ─────────────────────────────────────────────────────────────
// Task 11 — Admin: Completeness rules
// ─────────────────────────────────────────────────────────────
const AdminCompleteness = () => {
  const rules = [
    { field: 'Full name', section: 'Personal', weight: 10, enforced: true, coverage: 100 },
    { field: 'Email', section: 'Personal', weight: 10, enforced: true, coverage: 100 },
    { field: 'Phone', section: 'Personal', weight: 5, enforced: false, coverage: 94 },
    {
      field: 'Emergency contact #1',
      section: 'Personal',
      weight: 10,
      enforced: true,
      coverage: 87,
    },
    {
      field: 'Emergency contact #2',
      section: 'Personal',
      weight: 5,
      enforced: false,
      coverage: 42,
    },
    { field: 'Home address', section: 'Personal', weight: 8, enforced: true, coverage: 91 },
    { field: 'Tax form', section: 'Employment', weight: 12, enforced: true, coverage: 78 },
    { field: 'Bank details', section: 'Payroll', weight: 12, enforced: true, coverage: 83 },
    { field: 'Signed contract', section: 'Employment', weight: 15, enforced: true, coverage: 96 },
    { field: 'Preferred pronouns', section: 'Personal', weight: 2, enforced: false, coverage: 68 },
    { field: 'Profile photo', section: 'Personal', weight: 3, enforced: false, coverage: 52 },
    { field: 'Languages', section: 'Career', weight: 3, enforced: false, coverage: 81 },
  ]
  const bySection = rules.reduce((a, r) => {
    ;(a[r.section] = a[r.section] || []).push(r)
    return a
  }, {})
  const total = rules.filter((r) => r.enforced).reduce((s, r) => s + r.weight, 0)

  return (
    <AppShell
      active="settings"
      subtitle={
        <span>
          Settings <span style={{ color: '#62666d', margin: '0 4px' }}>/</span> Completeness rules
        </span>
      }
      primary={
        <Btn variant="primary" size="md" icon={I.check}>
          Save & apply
        </Btn>
      }
    >
      <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '1fr 340px', gap: 24 }}>
        <div>
          <div style={{ marginBottom: 16 }}>
            <h2
              style={{
                margin: 0,
                fontSize: 18,
                fontWeight: 510,
                color: '#f7f8f8',
                letterSpacing: '-0.02em',
              }}
            >
              Completeness rules
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#8a8f98' }}>
              Define what counts toward a complete profile. Weights determine impact on the score.
            </p>
          </div>

          {Object.entries(bySection).map(([sec, list]) => (
            <div
              key={sec}
              style={{
                marginBottom: 14,
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 8,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  padding: '10px 14px',
                  background: 'rgba(255,255,255,0.015)',
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <span style={{ color: '#62666d' }}>{I.chevD}</span>
                <span style={{ fontSize: 12, fontWeight: 510, color: '#f7f8f8' }}>{sec}</span>
                <span style={{ fontSize: 10, color: '#62666d' }}>{list.length} fields</span>
                <span style={{ flex: 1 }} />
                <span
                  style={{ fontSize: 10, color: '#62666d', fontFamily: 'IBM Plex Mono, monospace' }}
                >
                  Σ {list.reduce((s, r) => s + (r.enforced ? r.weight : 0), 0)} pts
                </span>
              </div>
              {list.map((r, i) => (
                <div
                  key={r.field}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1.6fr 80px 1.4fr 80px 40px',
                    padding: '10px 14px',
                    alignItems: 'center',
                    borderTop: i > 0 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                    fontSize: 12,
                    opacity: r.enforced ? 1 : 0.55,
                  }}
                >
                  <span style={{ color: '#f7f8f8', fontWeight: 510 }}>{r.field}</span>
                  <span>
                    <div
                      style={{
                        fontSize: 11,
                        color: '#d0d6e0',
                        fontFamily: 'IBM Plex Mono, monospace',
                      }}
                    >
                      {r.weight} pt{r.weight !== 1 ? 's' : ''}
                    </div>
                    <WeightBar value={r.weight} max={15} />
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div
                      style={{
                        flex: 1,
                        height: 4,
                        background: 'rgba(255,255,255,0.05)',
                        borderRadius: 2,
                        overflow: 'hidden',
                        maxWidth: 140,
                      }}
                    >
                      <div
                        style={{
                          width: r.coverage + '%',
                          height: '100%',
                          background:
                            r.coverage > 85 ? '#10b981' : r.coverage > 60 ? '#f59e0b' : '#ef4444',
                        }}
                      />
                    </div>
                    <span
                      style={{
                        fontSize: 11,
                        color: '#8a8f98',
                        fontFamily: 'IBM Plex Mono, monospace',
                        minWidth: 32,
                      }}
                    >
                      {r.coverage}%
                    </span>
                  </span>
                  <ToggleSwitch on={r.enforced} />
                  <IconBtn size={22}>{I.dots}</IconBtn>
                </div>
              ))}
            </div>
          ))}
        </div>

        <aside
          style={{ display: 'flex', flexDirection: 'column', gap: 14, position: 'sticky', top: 0 }}
        >
          <HRCard title="Score preview">
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 10 }}>
              <span
                style={{
                  fontSize: 32,
                  fontWeight: 510,
                  color: '#f7f8f8',
                  letterSpacing: '-0.02em',
                }}
              >
                82
              </span>
              <span style={{ fontSize: 14, color: '#62666d' }}>/ 100</span>
              <span style={{ flex: 1 }} />
              <Pill variant="success">+3 vs current</Pill>
            </div>
            <div
              style={{
                height: 4,
                background: 'rgba(255,255,255,0.05)',
                borderRadius: 2,
                overflow: 'hidden',
                marginBottom: 12,
              }}
            >
              <div
                style={{
                  width: '82%',
                  height: '100%',
                  background: 'linear-gradient(90deg, #5e6ad2, #7170ff)',
                }}
              />
            </div>
            <div style={{ fontSize: 11, color: '#8a8f98', lineHeight: 1.5 }}>
              Avg across 247 profiles if saved today. Total weights:{' '}
              <b style={{ color: '#d0d6e0' }}>{total} pts</b> enforced.
            </div>
          </HRCard>

          <HRCard title="Thresholds">
            {[
              ['Complete', 90, '#10b981'],
              ['Nearly complete', 75, '#f59e0b'],
              ['Needs attention', 50, '#ef4444'],
            ].map(([label, val, color]) => (
              <div
                key={label}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0' }}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
                <span style={{ flex: 1, fontSize: 12, color: '#d0d6e0' }}>{label}</span>
                <span
                  style={{ fontSize: 11, color: '#8a8f98', fontFamily: 'IBM Plex Mono, monospace' }}
                >
                  ≥ {val}%
                </span>
              </div>
            ))}
          </HRCard>

          <HRCard title="Enforcement">
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '5px 0',
                fontSize: 12,
                color: '#d0d6e0',
              }}
            >
              <Checkbox checked /> Show completeness badge on profile
            </label>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '5px 0',
                fontSize: 12,
                color: '#d0d6e0',
              }}
            >
              <Checkbox checked /> Prompt employees on login if &lt; 75%
            </label>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '5px 0',
                fontSize: 12,
                color: '#d0d6e0',
              }}
            >
              <Checkbox /> Block payroll if required fields missing
            </label>
          </HRCard>
        </aside>
      </div>
    </AppShell>
  )
}

const WeightBar = ({ value, max }) => (
  <div style={{ display: 'flex', gap: 1, marginTop: 3 }}>
    {Array.from({ length: max }).map((_, i) => (
      <div
        key={i}
        style={{
          width: 3,
          height: 5,
          background: i < value ? '#7170ff' : 'rgba(255,255,255,0.06)',
          borderRadius: 1,
        }}
      />
    ))}
  </div>
)

const ToggleSwitch = ({ on }) => (
  <div
    style={{
      width: 26,
      height: 14,
      borderRadius: 7,
      background: on ? '#7170ff' : 'rgba(255,255,255,0.08)',
      position: 'relative',
      cursor: 'pointer',
      transition: 'background 120ms',
    }}
  >
    <div
      style={{
        position: 'absolute',
        top: 1,
        left: on ? 13 : 1,
        width: 12,
        height: 12,
        borderRadius: 6,
        background: '#f7f8f8',
        transition: 'left 120ms',
      }}
    />
  </div>
)

// ─────────────────────────────────────────────────────────────
// Task 09 — Admin: Share links (LinkedIn + public)
// ─────────────────────────────────────────────────────────────
const AdminShareLinks = () => {
  const emp = PeopleData.EMPLOYEES[3]
  return (
    <AppShell
      active="settings"
      subtitle={
        <span>
          Settings <span style={{ color: '#62666d', margin: '0 4px' }}>/</span> Share & integrations
        </span>
      }
    >
      <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 24 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <h2
              style={{
                margin: 0,
                fontSize: 18,
                fontWeight: 510,
                color: '#f7f8f8',
                letterSpacing: '-0.02em',
              }}
            >
              Share & integrations
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#8a8f98' }}>
              Public profile links and LinkedIn sync.
            </p>
          </div>

          {/* LinkedIn */}
          <HRCard title="LinkedIn" action={<Pill variant="success">Connected</Pill>}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 8,
                  background: '#0a66c2',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: 18,
                  letterSpacing: '-0.03em',
                }}
              >
                in
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: '#f7f8f8', fontWeight: 510 }}>
                  Acme Co on LinkedIn
                </div>
                <div style={{ fontSize: 11, color: '#62666d' }}>
                  Org ID: 42008172 · Last sync 2 hours ago
                </div>
              </div>
              <Btn variant="subtle" size="sm">
                Reconnect
              </Btn>
              <Btn variant="ghost" size="sm">
                Disconnect
              </Btn>
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
              Sync fields
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {[
                ['Job title', true],
                ['Department', true],
                ['Location', true],
                ['Start date', true],
                ['Profile photo', false],
                ['Level', false],
                ['Bio / about', true],
                ['Skills', false],
              ].map(([f, on]) => (
                <label
                  key={f}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '5px 8px',
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.05)',
                    borderRadius: 6,
                    fontSize: 12,
                    color: '#d0d6e0',
                  }}
                >
                  <Checkbox checked={on} /> {f}
                </label>
              ))}
            </div>

            <div
              style={{
                marginTop: 14,
                padding: 10,
                background: 'rgba(113,112,255,0.04)',
                border: '1px solid rgba(113,112,255,0.2)',
                borderRadius: 6,
                fontSize: 11,
                color: '#d0d6e0',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span style={{ color: '#9ea2ff' }}>{I.users}</span>
              Employees control their own LinkedIn link. This syncs <b>outbound</b> company info —
              never inbound.
            </div>
          </HRCard>

          {/* Public share links */}
          <HRCard
            title="Public share links"
            action={
              <Btn variant="primary" size="sm" icon={I.plus}>
                Create link
              </Btn>
            }
          >
            {[
              {
                name: 'Diego Ribeiro — recruiter share',
                scope: 'Profile · basics',
                uses: 4,
                maxUses: 10,
                expires: 'Apr 15',
              },
              {
                name: 'Headcount report — investors',
                scope: 'Report · headcount',
                uses: 1,
                maxUses: 3,
                expires: 'Mar 30',
              },
              {
                name: 'Org chart — external audit',
                scope: 'Full org chart',
                uses: 12,
                maxUses: 50,
                expires: 'Never',
              },
            ].map((l, i) => (
              <div
                key={l.name}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.4fr 1fr 90px 90px 40px',
                  padding: '11px 0',
                  alignItems: 'center',
                  borderTop: i > 0 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                  fontSize: 12,
                }}
              >
                <div>
                  <div style={{ color: '#f7f8f8', fontWeight: 510 }}>{l.name}</div>
                  <div
                    style={{
                      color: '#62666d',
                      fontSize: 10,
                      fontFamily: 'IBM Plex Mono, monospace',
                      marginTop: 2,
                    }}
                  >
                    acme.co/s/{l.name.slice(0, 6).toLowerCase().replace(/\s/g, '')}_x7
                  </div>
                </div>
                <span style={{ color: '#8a8f98' }}>{l.scope}</span>
                <span
                  style={{ color: '#d0d6e0', fontFamily: 'IBM Plex Mono, monospace', fontSize: 11 }}
                >
                  {l.uses}/{l.maxUses}
                </span>
                <span style={{ color: '#8a8f98', fontSize: 11 }}>{l.expires}</span>
                <span style={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                  <IconBtn size={22}>{I.share}</IconBtn>
                </span>
              </div>
            ))}
          </HRCard>
        </div>

        {/* Preview */}
        <aside>
          <HRCard title="Recruiter share · preview">
            <div style={{ background: '#fff', borderRadius: 6, padding: 20, color: '#191a1b' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 8,
                    background: '#7170ff',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 600,
                  }}
                >
                  DR
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>Diego Ribeiro</div>
                  <div style={{ fontSize: 11, color: '#62666d' }}>Staff Engineer · Platform</div>
                </div>
              </div>
              <div style={{ fontSize: 11, color: '#191a1b', lineHeight: 1.6 }}>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '100px 1fr',
                    padding: '4px 0',
                    borderTop: '1px solid #f0eee9',
                  }}
                >
                  <span style={{ color: '#62666d' }}>Location</span>
                  <span>Hanoi · Hybrid</span>
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '100px 1fr',
                    padding: '4px 0',
                    borderTop: '1px solid #f0eee9',
                  }}
                >
                  <span style={{ color: '#62666d' }}>Start date</span>
                  <span>Jul 15, 2023</span>
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '100px 1fr',
                    padding: '4px 0',
                    borderTop: '1px solid #f0eee9',
                  }}
                >
                  <span style={{ color: '#62666d' }}>Tenure</span>
                  <span>2 years 8 months</span>
                </div>
              </div>
              <div
                style={{
                  marginTop: 14,
                  padding: 8,
                  background: '#f7f5ef',
                  borderRadius: 4,
                  fontSize: 10,
                  color: '#62666d',
                  textAlign: 'center',
                }}
              >
                Shared by Acme Co · powered by People
              </div>
            </div>
            <div style={{ fontSize: 10, color: '#62666d', marginTop: 10, lineHeight: 1.5 }}>
              Recipients see only fields you've included — no salary, no personal contact. Views are
              logged and expire at the set date.
            </div>
          </HRCard>
        </aside>
      </div>
    </AppShell>
  )
}

// ─────────────────────────────────────────────────────────────
// Task 10 — Bulk actions (status / manager / department split)
// ─────────────────────────────────────────────────────────────
const BulkActions = ({ mode = 'status' }) => {
  const rows = PeopleData.EMPLOYEES.slice(0, 8)
  const [action, setAction] = React.useState(mode)

  return (
    <AppShell
      active="directory"
      subtitle={
        <span>
          Directory <span style={{ color: '#62666d', margin: '0 4px' }}>/</span> Bulk edit{' '}
          {rows.length} people
        </span>
      }
    >
      <div
        style={{
          padding: '14px 16px',
          background: 'rgba(113,112,255,0.06)',
          borderBottom: '1px solid rgba(113,112,255,0.2)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <span style={{ color: '#9ea2ff', fontWeight: 510, fontSize: 12 }}>
          {rows.length} people selected
        </span>
        <div style={{ display: 'flex', gap: -1, marginLeft: 'auto' }}>
          {[
            ['status', 'Status'],
            ['manager', 'Manager'],
            ['department', 'Department'],
          ].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setAction(id)}
              style={{
                padding: '5px 12px',
                background: action === id ? 'rgba(255,255,255,0.08)' : 'transparent',
                border: '1px solid rgba(255,255,255,0.08)',
                color: action === id ? '#f7f8f8' : '#8a8f98',
                fontSize: 12,
                fontWeight: 510,
                cursor: 'pointer',
                fontFamily: 'inherit',
                borderRadius: 0,
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 24 }}>
        {/* Target list */}
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 510,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: '#62666d',
              marginBottom: 8,
            }}
          >
            Affected ({rows.length})
          </div>
          <div
            style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 8,
              overflow: 'hidden',
            }}
          >
            {rows.map((r, i) => (
              <div
                key={r.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '28px 1.4fr 1fr 1fr 120px 28px',
                  padding: '9px 14px',
                  alignItems: 'center',
                  borderTop: i > 0 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                  fontSize: 12,
                }}
              >
                <Checkbox checked />
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Avatar
                    name={r.fullName}
                    initials={r.initials}
                    deptColor={r.deptColor}
                    size={22}
                  />
                  <span style={{ color: '#f7f8f8', fontWeight: 510 }}>{r.fullName}</span>
                </span>
                <span style={{ color: '#8a8f98' }}>{r.title}</span>
                <span style={{ color: '#8a8f98' }}>{r.department}</span>
                <StatusPill status={r.status} size="sm" />
                <IconBtn size={22}>{I.x}</IconBtn>
              </div>
            ))}
          </div>
        </div>

        {/* Action panel */}
        <aside>
          {action === 'status' && <BulkStatus rows={rows} />}
          {action === 'manager' && <BulkManager rows={rows} />}
          {action === 'department' && <BulkDepartment rows={rows} />}
        </aside>
      </div>
    </AppShell>
  )
}

const BulkStatus = ({ rows }) => (
  <HRCard title="Change status" pad={16}>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
      {[
        { status: 'Active', desc: 'Standard employed', color: '#10b981' },
        { status: 'Leave', desc: 'Temporary leave — retained', color: '#06b6d4' },
        { status: 'Probation', desc: 'Under probation review', color: '#f59e0b' },
        { status: 'Offboarding', desc: 'Offboarding in progress', color: '#ef4444' },
      ].map((s, i) => (
        <div
          key={s.status}
          style={{
            padding: 10,
            background: i === 1 ? 'rgba(6,182,212,0.08)' : 'rgba(255,255,255,0.02)',
            border: `1px solid ${i === 1 ? 'rgba(6,182,212,0.3)' : 'rgba(255,255,255,0.05)'}`,
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            cursor: 'pointer',
          }}
        >
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 510, color: '#f7f8f8' }}>{s.status}</div>
            <div style={{ fontSize: 11, color: '#8a8f98' }}>{s.desc}</div>
          </div>
          {i === 1 && <span style={{ color: '#06b6d4' }}>{I.check}</span>}
        </div>
      ))}
    </div>
    <HRField label="Effective date" value="Apr 1, 2026" />
    <div style={{ marginTop: 10 }}>
      <HRField label="Reason" value="Parental leave program — extended coverage." />
    </div>
    <div
      style={{
        padding: 10,
        background: 'rgba(245,158,11,0.05)',
        border: '1px solid rgba(245,158,11,0.2)',
        borderRadius: 6,
        marginTop: 14,
        display: 'flex',
        gap: 8,
      }}
    >
      <span style={{ color: '#fbbf24' }}>{I.alert}</span>
      <div style={{ flex: 1, fontSize: 11, color: '#fbbf24', lineHeight: 1.5 }}>
        Setting status to <b>Leave</b> will pause timesheets for all {rows.length} people but keep
        payroll.
      </div>
    </div>
    <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
      <Btn variant="subtle" size="md">
        Cancel
      </Btn>
      <div style={{ flex: 1 }} />
      <Btn variant="primary" size="md" icon={I.check}>
        Apply to {rows.length}
      </Btn>
    </div>
  </HRCard>
)

const BulkManager = ({ rows }) => (
  <HRCard title="Reassign manager" pad={16}>
    <div style={{ fontSize: 11, color: '#62666d', marginBottom: 6 }}>Currently reporting to</div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
      {[
        ['Kai Tanaka', 5],
        ['Priya Patel', 3],
      ].map(([n, c]) => (
        <div
          key={n}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: 8,
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.05)',
            borderRadius: 6,
          }}
        >
          <Avatar
            name={n}
            initials={n
              .split(' ')
              .map((s) => s[0])
              .join('')}
            deptColor="#7170ff"
            size={22}
          />
          <span style={{ flex: 1, fontSize: 12, color: '#d0d6e0' }}>{n}</span>
          <span style={{ fontSize: 11, color: '#62666d' }}>{c} people</span>
        </div>
      ))}
    </div>

    <div style={{ fontSize: 11, color: '#62666d', marginBottom: 6 }}>New manager</div>
    <div
      style={{
        padding: 10,
        background: 'rgba(16,185,129,0.05)',
        border: '1px solid rgba(16,185,129,0.25)',
        borderRadius: 6,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        marginBottom: 14,
      }}
    >
      <Avatar name="Mei Chen" initials="MC" deptColor="#7170ff" size={32} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, color: '#f7f8f8', fontWeight: 510 }}>Mei Chen</div>
        <div style={{ fontSize: 11, color: '#62666d' }}>
          VP Engineering · current direct reports: 6
        </div>
      </div>
      <Btn variant="ghost" size="sm">
        Change
      </Btn>
    </div>

    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label
        style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#d0d6e0' }}
      >
        <Checkbox checked /> Notify affected employees
      </label>
      <label
        style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#d0d6e0' }}
      >
        <Checkbox checked /> Notify outgoing managers
      </label>
      <label
        style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#d0d6e0' }}
      >
        <Checkbox /> Cascade to skip-level direct reports ({rows.length > 5 ? 3 : 0})
      </label>
    </div>

    <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
      <Btn variant="subtle" size="md">
        Cancel
      </Btn>
      <div style={{ flex: 1 }} />
      <Btn variant="primary" size="md" icon={I.check}>
        Reassign {rows.length}
      </Btn>
    </div>
  </HRCard>
)

const BulkDepartment = ({ rows }) => {
  // Split: not everyone in bulk set should go to the same dept
  const splits = [
    { dept: 'Platform', count: 4, color: '#7170ff', picked: rows.slice(0, 4) },
    { dept: 'Infrastructure', count: 3, color: '#06b6d4', picked: rows.slice(4, 7) },
    { dept: 'Leave unchanged', count: 1, color: '#62666d', picked: rows.slice(7) },
  ]
  return (
    <HRCard title="Reassign department" pad={16}>
      <div
        style={{
          padding: 10,
          background: 'rgba(113,112,255,0.04)',
          border: '1px solid rgba(113,112,255,0.2)',
          borderRadius: 6,
          marginBottom: 14,
          fontSize: 11,
          color: '#d0d6e0',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <span style={{ color: '#9ea2ff' }}>{I.users}</span>
        This bulk set spans multiple teams. Split them into target departments below.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {splits.map((s, i) => (
          <div
            key={s.dept}
            style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 6,
              padding: 10,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color }} />
              <span style={{ fontSize: 12, fontWeight: 510, color: '#f7f8f8' }}>{s.dept}</span>
              <span style={{ fontSize: 11, color: '#62666d' }}>{s.count} people</span>
              <span style={{ flex: 1 }} />
              <Btn variant="ghost" size="sm">
                Change
              </Btn>
            </div>
            <div style={{ display: 'flex', gap: -4, marginLeft: 18 }}>
              {s.picked.slice(0, 4).map((p, j) => (
                <div key={p.id} style={{ marginLeft: j === 0 ? 0 : -6 }}>
                  <Avatar
                    name={p.fullName}
                    initials={p.initials}
                    deptColor={p.deptColor}
                    size={22}
                  />
                </div>
              ))}
              {s.picked.length > 4 && (
                <span
                  style={{
                    marginLeft: -6,
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    background: 'rgba(255,255,255,0.06)',
                    color: '#d0d6e0',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 10,
                    fontWeight: 510,
                  }}
                >
                  +{s.picked.length - 4}
                </span>
              )}
            </div>
          </div>
        ))}
        <button
          style={{
            padding: 10,
            background: 'transparent',
            border: '1px dashed rgba(255,255,255,0.08)',
            borderRadius: 6,
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
          {I.plus}Add department split
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <Btn variant="subtle" size="md">
          Cancel
        </Btn>
        <div style={{ flex: 1 }} />
        <Btn variant="primary" size="md" icon={I.check}>
          Apply splits
        </Btn>
      </div>
    </HRCard>
  )
}

// Exports
Object.assign(window, {
  JobHistoryTab,
  DocumentsTab,
  CompensationTab,
  DocIcon,
  DeleteConfirm,
  RehireDialog,
  HRField,
  HRCard,
  DirectoryHierarchyFilter,
  TreeNode,
  SectionChangeRequest,
  ProbationList,
  AdminCustomFields,
  AdminCompleteness,
  AdminShareLinks,
  BulkActions,
  BulkStatus,
  BulkManager,
  BulkDepartment,
  WeightBar,
  ToggleSwitch,
})
