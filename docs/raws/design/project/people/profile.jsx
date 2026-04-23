// Employee profile — reworked hierarchy with better grouping and side panel
const Profile = ({ initialTab, terminated, showRehireDialog }) => {
  const emp = terminated
    ? { ...PeopleData.EMPLOYEES[5], status: 'Terminated' }
    : PeopleData.EMPLOYEES[3]
  const [tab, setTab] = React.useState(initialTab || 'overview')

  return (
    <AppShell
      active="directory"
      subtitle={
        <span>
          Directory <span style={{ color: '#62666d', margin: '0 4px' }}>/</span> {emp.fullName}
        </span>
      }
      primary={
        <Btn variant="primary" size="md" icon={I.edit}>
          Edit profile
        </Btn>
      }
      secondary={
        <>
          <Btn variant="ghost" size="md" icon={I.share}>
            Share
          </Btn>
          <IconBtn title="More">{I.dots}</IconBtn>
        </>
      }
    >
      {/* Hero header */}
      <div style={{ padding: '24px 32px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20 }}>
          <Avatar name={emp.fullName} initials={emp.initials} deptColor={emp.deptColor} size={72} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <h1
                style={{
                  fontSize: 24,
                  fontWeight: 510,
                  letterSpacing: '-0.02em',
                  color: '#f7f8f8',
                  margin: 0,
                }}
              >
                {emp.fullName}
              </h1>
              <StatusPill status={emp.status} />
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 13,
                color: '#d0d6e0',
              }}
            >
              <span>{emp.title}</span>
              <span style={{ color: '#3e3e44' }}>·</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 6, height: 6, borderRadius: 2, background: emp.deptColor }} />
                {emp.department}
              </span>
              <span style={{ color: '#3e3e44' }}>·</span>
              <span style={{ color: '#8a8f98' }}>{emp.location}</span>
              <span style={{ color: '#3e3e44' }}>·</span>
              <span
                style={{ color: '#8a8f98', fontFamily: 'IBM Plex Mono, monospace', fontSize: 11 }}
              >
                {emp.level}
              </span>
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                marginTop: 12,
                fontSize: 12,
                color: '#8a8f98',
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {I.mail}
                {emp.email}
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {I.phone}+84 90 123 4567
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {I.calendar}Joined {Math.floor(emp.hiredDays / 30)} months ago
              </span>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 2, marginTop: 20 }}>
          {[
            ['overview', 'Overview'],
            ['jobs', 'Job history'],
            ['documents', 'Documents', 4],
            ['compensation', 'Compensation'],
            ['changes', 'Change requests', 1],
            ['activity', 'Activity'],
          ].map(([id, label, count]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              style={{
                padding: '8px 12px',
                background: 'transparent',
                border: 'none',
                borderBottom: `2px solid ${tab === id ? '#7170ff' : 'transparent'}`,
                color: tab === id ? '#f7f8f8' : '#8a8f98',
                fontSize: 12,
                fontWeight: 510,
                letterSpacing: '-0.01em',
                cursor: 'pointer',
                fontFamily: 'inherit',
                marginBottom: -1,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              {label}
              {count && (
                <span
                  style={{
                    fontSize: 10,
                    padding: '1px 5px',
                    borderRadius: 3,
                    background: 'rgba(255,255,255,0.05)',
                    color: '#8a8f98',
                  }}
                >
                  {count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Terminated banner */}
      {terminated && (
        <div
          style={{
            margin: '16px 32px 0',
            padding: 14,
            background: 'rgba(239,68,68,0.05)',
            border: '1px solid rgba(239,68,68,0.2)',
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <span style={{ color: '#f87171' }}>{I.alert}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 510, color: '#fca5a5' }}>
              Employment ended Mar 12, 2026 · Resignation
            </div>
            <div style={{ fontSize: 11, color: '#f87171', opacity: 0.75, marginTop: 2 }}>
              Read-only. Record preserved for compliance. Previous profile:{' '}
              <span style={{ fontFamily: 'IBM Plex Mono, monospace' }}>E-0087</span>
            </div>
          </div>
          <Btn variant="primary" size="sm" icon={I.plus}>
            Rehire
          </Btn>
        </div>
      )}

      {showRehireDialog && <RehireDialog emp={emp} />}

      {/* Body */}
      {tab === 'jobs' && <JobHistoryTab emp={emp} />}
      {tab === 'documents' && <DocumentsTab emp={emp} />}
      {tab === 'compensation' && <CompensationTab emp={emp} />}
      {(tab === 'overview' || tab === 'changes' || tab === 'activity') && (
        <div style={{ padding: 32, display: 'grid', gridTemplateColumns: '1fr 300px', gap: 32 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <ProfileCard title="About" action="Edit">
              <KV label="Preferred name" value="Diego" />
              <KV label="Pronouns" value="he/him" />
              <KV label="Start date" value="Jul 15, 2023" />
              <KV label="Employee ID" value="E-0412" mono />
            </ProfileCard>

            <ProfileCard title="Job" action="Edit">
              <KV label="Job title" value={emp.title} />
              <KV label="Level" value={emp.level} mono />
              <KV label="Department" value={emp.department} />
              <KV label="Employment type" value={emp.employmentType} />
              <KV label="Work arrangement" value="Hybrid — 3 days" />
            </ProfileCard>

            <ProfileCard title="Compensation" action="View" locked>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: 10,
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.05)',
                  borderRadius: 6,
                }}
              >
                <span style={{ color: '#62666d' }}>{I.lock}</span>
                <span style={{ fontSize: 12, color: '#8a8f98' }}>
                  Restricted. You can view salary with{' '}
                  <b style={{ color: '#d0d6e0', fontWeight: 510 }}>people:salary:read</b>{' '}
                  permission.
                </span>
              </div>
            </ProfileCard>

            <ProfileCard title="Emergency contacts" action="Add">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0' }}>
                <Avatar name="Maria Ribeiro" initials="MR" deptColor="#f59e0b" size={28} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 510, color: '#f7f8f8' }}>
                    Maria Ribeiro
                  </div>
                  <div style={{ fontSize: 11, color: '#62666d' }}>Spouse · +84 91 234 5678</div>
                </div>
                <Pill>Primary</Pill>
              </div>
            </ProfileCard>
          </div>

          {/* Side rail */}
          <aside style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <SideCard title="Completeness">
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 8 }}>
                <span
                  style={{
                    fontSize: 24,
                    fontWeight: 510,
                    color: '#f7f8f8',
                    letterSpacing: '-0.02em',
                  }}
                >
                  82
                </span>
                <span style={{ fontSize: 13, color: '#62666d' }}>%</span>
                <span style={{ flex: 1 }} />
                <Pill variant="accent">3 missing</Pill>
              </div>
              <div
                style={{
                  height: 4,
                  background: 'rgba(255,255,255,0.05)',
                  borderRadius: 2,
                  overflow: 'hidden',
                  marginBottom: 10,
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
              {['Emergency contact #2', 'Bank details', 'Tax form'].map((m) => (
                <div
                  key={m}
                  style={{
                    fontSize: 11,
                    color: '#8a8f98',
                    padding: '3px 0',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <span
                    style={{ width: 4, height: 4, borderRadius: '50%', background: '#f59e0b' }}
                  />
                  {m}
                </div>
              ))}
            </SideCard>

            <SideCard title="Reports to">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                <Avatar name="Mei Chen" initials="MC" deptColor="#7170ff" size={26} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 510, color: '#f7f8f8' }}>Mei Chen</div>
                  <div style={{ fontSize: 10, color: '#62666d' }}>Eng Manager</div>
                </div>
              </div>
            </SideCard>

            <SideCard title="Direct reports" count={3}>
              {PeopleData.EMPLOYEES.slice(10, 13).map((r) => (
                <div
                  key={r.id}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}
                >
                  <Avatar
                    name={r.fullName}
                    initials={r.initials}
                    deptColor={r.deptColor}
                    size={22}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: '#d0d6e0' }}>{r.fullName}</div>
                    <div style={{ fontSize: 10, color: '#62666d' }}>{r.title}</div>
                  </div>
                </div>
              ))}
            </SideCard>

            <SideCard title="Recent activity">
              {[
                ['Promoted to Staff Engineer', '3 days ago'],
                ['Document uploaded: Tax 2025', '1 week ago'],
                ['Changed manager to Mei Chen', '2 weeks ago'],
              ].map(([t, when], i) => (
                <div
                  key={i}
                  style={{
                    padding: '6px 0',
                    borderTop: i > 0 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                  }}
                >
                  <div style={{ fontSize: 11, color: '#d0d6e0' }}>{t}</div>
                  <div style={{ fontSize: 10, color: '#62666d' }}>{when}</div>
                </div>
              ))}
            </SideCard>
          </aside>
        </div>
      )}
    </AppShell>
  )
}

const ProfileCard = ({ title, action, locked, children }) => (
  <section
    style={{
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 8,
    }}
  >
    <header
      style={{
        padding: '10px 14px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
      }}
    >
      <h3
        style={{
          margin: 0,
          fontSize: 12,
          fontWeight: 510,
          color: '#f7f8f8',
          letterSpacing: '-0.01em',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        {locked && <span style={{ color: '#62666d' }}>{I.lock}</span>}
        {title}
      </h3>
      {action && (
        <button
          style={{
            background: 'transparent',
            border: 'none',
            color: '#8a8f98',
            fontSize: 11,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {action}
        </button>
      )}
    </header>
    <div style={{ padding: '4px 14px 10px' }}>{children}</div>
  </section>
)

const KV = ({ label, value, mono }) => (
  <div
    style={{
      display: 'grid',
      gridTemplateColumns: '160px 1fr',
      padding: '6px 0',
      borderBottom: '1px solid rgba(255,255,255,0.03)',
    }}
  >
    <span style={{ fontSize: 11, color: '#62666d' }}>{label}</span>
    <span
      style={{
        fontSize: 12,
        color: '#d0d6e0',
        fontFamily: mono ? 'IBM Plex Mono, monospace' : 'inherit',
      }}
    >
      {value}
    </span>
  </div>
)

const SideCard = ({ title, count, children }) => (
  <section
    style={{
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 8,
      padding: 12,
    }}
  >
    <header style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
      <h4
        style={{
          margin: 0,
          fontSize: 10,
          fontWeight: 510,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: '#62666d',
        }}
      >
        {title}
        {count != null && <span style={{ marginLeft: 6, color: '#8a8f98' }}>{count}</span>}
      </h4>
    </header>
    {children}
  </section>
)

Object.assign(window, { Profile, ProfileCard, KV, SideCard })
