// Directory page — the hero surface. Dense list + saved views + better filters.
const Directory = () => {
  const [selected, setSelected] = React.useState(new Set())
  const [view, setView] = React.useState('list')
  const [activeView, setActiveView] = React.useState('all')
  const [grouping, setGrouping] = React.useState('none')
  const rows = PeopleData.EMPLOYEES.slice(0, 24)

  const toggle = (id) =>
    setSelected((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const groups =
    grouping === 'dept'
      ? Object.entries(
          rows.reduce((acc, r) => {
            ;(acc[r.department] = acc[r.department] || []).push(r)
            return acc
          }, {}),
        )
      : [['All', rows]]

  return (
    <AppShell
      active="directory"
      subtitle="Directory"
      primary={
        <Btn variant="primary" size="md" icon={I.plus}>
          Add employee
        </Btn>
      }
      secondary={
        <Btn variant="ghost" size="md" icon={I.download}>
          Export
        </Btn>
      }
    >
      {/* Saved views bar (horizontal, Linear-style) */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          padding: '8px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
          overflow: 'auto',
        }}
      >
        {PeopleData.SAVED_VIEWS.map((v) => (
          <button
            key={v.id}
            onClick={() => setActiveView(v.id)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '5px 10px',
              borderRadius: 6,
              background: activeView === v.id ? 'rgba(255,255,255,0.05)' : 'transparent',
              border:
                activeView === v.id ? '1px solid rgba(255,255,255,0.08)' : '1px solid transparent',
              color: activeView === v.id ? '#f7f8f8' : '#8a8f98',
              fontSize: 12,
              fontWeight: 510,
              letterSpacing: '-0.01em',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              fontFamily: 'inherit',
            }}
          >
            {v.name}
            <span style={{ fontSize: 10, color: activeView === v.id ? '#8a8f98' : '#62666d' }}>
              {v.count}
            </span>
          </button>
        ))}
        <div
          style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.08)', margin: '0 6px' }}
        />
        <button
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '5px 8px',
            borderRadius: 6,
            background: 'transparent',
            border: 'none',
            color: '#62666d',
            fontSize: 12,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {I.plus}
          <span>New view</span>
        </button>
      </div>

      {/* Filter + toolbar row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
        }}
      >
        <FilterChip label="Department" value="Eng, Product, Design" active />
        <FilterChip label="Status" value="Active" active />
        <FilterChip label="Location" />
        <FilterChip label="Manager" />
        <FilterChip label="Hired" />
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
        <span style={{ fontSize: 11, color: '#62666d' }}>247 people</span>
        <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.08)' }} />

        <GroupByDropdown value={grouping} onChange={setGrouping} />
        <Btn variant="ghost" size="sm" icon={I.sort}>
          Sort
        </Btn>

        <div
          style={{
            display: 'flex',
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 6,
            overflow: 'hidden',
          }}
        >
          <IconBtn size={24} active={view === 'list'} onClick={() => setView('list')} title="List">
            {I.list}
          </IconBtn>
          <IconBtn size={24} active={view === 'grid'} onClick={() => setView('grid')} title="Grid">
            {I.grid}
          </IconBtn>
        </div>
      </div>

      {/* Selection bar */}
      {selected.size > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '8px 16px',
            background: 'rgba(113,112,255,0.06)',
            borderBottom: '1px solid rgba(113,112,255,0.2)',
            fontSize: 12,
          }}
        >
          <span style={{ color: '#9ea2ff', fontWeight: 510 }}>{selected.size} selected</span>
          <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.08)' }} />
          <Btn variant="subtle" size="sm" icon={I.mail}>
            Email
          </Btn>
          <Btn variant="subtle" size="sm" icon={I.tag}>
            Tag
          </Btn>
          <Btn variant="subtle" size="sm" icon={I.edit}>
            Bulk edit
          </Btn>
          <Btn variant="subtle" size="sm" icon={I.share}>
            Export
          </Btn>
          <div style={{ flex: 1 }} />
          <button
            onClick={() => setSelected(new Set())}
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

      {/* List */}
      {view === 'list' ? (
        <div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '28px minmax(240px,1.8fr) 1fr 120px 1fr 80px 90px 28px',
              padding: '6px 16px',
              fontSize: 10,
              fontWeight: 510,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: '#62666d',
              borderBottom: '1px solid rgba(255,255,255,0.05)',
            }}
          >
            <span />
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>Name {I.arrowUp}</span>
            <span>Role</span>
            <span>Department</span>
            <span>Location</span>
            <span>Level</span>
            <span>Status</span>
            <span />
          </div>
          {groups.map(([groupName, groupRows]) => (
            <div key={groupName}>
              {grouping !== 'none' && (
                <div
                  style={{
                    padding: '6px 16px',
                    background: 'rgba(255,255,255,0.015)',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    fontSize: 11,
                    fontWeight: 510,
                    color: '#8a8f98',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <span>{I.chevD}</span>
                  {groupName}
                  <span style={{ color: '#62666d' }}>{groupRows.length}</span>
                </div>
              )}
              {groupRows.map((r, i) => (
                <DirectoryRow
                  key={r.id}
                  row={r}
                  selected={selected.has(r.id)}
                  onToggle={() => toggle(r.id)}
                />
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div
          style={{
            padding: 16,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: 10,
          }}
        >
          {rows.map((r) => (
            <EmployeeCard key={r.id} row={r} />
          ))}
        </div>
      )}
    </AppShell>
  )
}

const DirectoryRow = ({ row, selected, onToggle }) => (
  <div
    style={{
      display: 'grid',
      gridTemplateColumns: '28px minmax(240px,1.8fr) 1fr 120px 1fr 80px 90px 28px',
      padding: '7px 16px',
      alignItems: 'center',
      borderBottom: '1px solid rgba(255,255,255,0.04)',
      background: selected ? 'rgba(113,112,255,0.04)' : 'transparent',
      cursor: 'pointer',
      fontSize: 12,
      transition: 'background 100ms',
    }}
    onMouseEnter={(e) => {
      if (!selected) e.currentTarget.style.background = 'rgba(255,255,255,0.02)'
    }}
    onMouseLeave={(e) => {
      if (!selected) e.currentTarget.style.background = 'transparent'
    }}
  >
    <span
      style={{ display: 'flex', alignItems: 'center' }}
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
    >
      <Checkbox checked={selected} />
    </span>
    <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
      <Avatar name={row.fullName} initials={row.initials} deptColor={row.deptColor} size={22} />
      <span style={{ fontWeight: 510, color: 'var(--pm-text, #f7f8f8)', letterSpacing: '-0.01em' }}>
        {row.fullName}
      </span>
      {row.hasOpenChanges && <Pill variant="warning">1 open</Pill>}
    </span>
    <span style={{ color: 'var(--pm-text2, #d0d6e0)' }}>{row.title}</span>
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        color: 'var(--pm-text2, #d0d6e0)',
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: 2, background: row.deptColor }} />
      {row.department}
    </span>
    <span style={{ color: 'var(--pm-text3, #8a8f98)' }}>{row.location}</span>
    <span
      style={{
        color: 'var(--pm-text3, #8a8f98)',
        fontFamily: 'IBM Plex Mono, monospace',
        fontSize: 11,
      }}
    >
      {row.level}
    </span>
    <StatusPill status={row.status} size="sm" />
    <span
      style={{ color: 'var(--pm-text4, #62666d)', display: 'flex', justifyContent: 'flex-end' }}
    >
      {I.chevR}
    </span>
  </div>
)

const Checkbox = ({ checked }) => (
  <span
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 14,
      height: 14,
      borderRadius: 3,
      border: `1px solid ${checked ? '#5e6ad2' : 'rgba(255,255,255,0.15)'}`,
      background: checked ? '#5e6ad2' : 'transparent',
      color: '#fff',
    }}
  >
    {checked && I.check}
  </span>
)

const FilterChip = ({ label, value, active }) => (
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
      letterSpacing: '-0.01em',
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

const GroupByDropdown = ({ value, onChange }) => (
  <button
    onClick={() => onChange(value === 'none' ? 'dept' : 'none')}
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      padding: '4px 8px',
      borderRadius: 6,
      background: value !== 'none' ? 'rgba(113,112,255,0.08)' : 'rgba(255,255,255,0.02)',
      border: `1px solid ${value !== 'none' ? 'rgba(113,112,255,0.25)' : 'rgba(255,255,255,0.08)'}`,
      color: value !== 'none' ? '#9ea2ff' : '#d0d6e0',
      fontSize: 11,
      fontWeight: 510,
      cursor: 'pointer',
      fontFamily: 'inherit',
    }}
  >
    {I.columns}
    <span>Group: {value === 'none' ? 'None' : 'Department'}</span>
    {I.chevD}
  </button>
)

const EmployeeCard = ({ row }) => (
  <div
    style={{
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 8,
      padding: 12,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      cursor: 'pointer',
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <Avatar name={row.fullName} initials={row.initials} deptColor={row.deptColor} size={36} />
      <StatusPill status={row.status} size="sm" />
    </div>
    <div>
      <div style={{ fontSize: 13, fontWeight: 510, color: 'var(--pm-text, #f7f8f8)' }}>
        {row.fullName}
      </div>
      <div style={{ fontSize: 11, color: 'var(--pm-text3, #8a8f98)' }}>{row.title}</div>
    </div>
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 11,
        color: 'var(--pm-text4, #62666d)',
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: 2, background: row.deptColor }} />
      <span>{row.department}</span>
      <span>·</span>
      <span>{row.location}</span>
    </div>
  </div>
)

Object.assign(window, {
  Directory,
  DirectoryRow,
  Checkbox,
  FilterChip,
  GroupByDropdown,
  EmployeeCard,
})
