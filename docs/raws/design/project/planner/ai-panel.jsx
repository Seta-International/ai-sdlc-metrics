// AI agent chat panel — modeled on the agent-runtime SSE contract:
// router plan -> phase (tool calls) -> synthesizer tokens -> draft-phase
// Supports: iteration triplet, intent_slug/flow_id, cost/usage,
// cancel, draft-approval cards, sub-agent routing, tool trace rows.

// ---------- Shared bits ----------

const aiColors = {
  bg: '#0b0c0d',
  panel: '#0f1011',
  line: 'rgba(255,255,255,0.05)',
  line2: 'rgba(255,255,255,0.08)',
  text: '#f7f8f8',
  sub: '#8a8f98',
  muted: '#62666d',
  chipBg: 'rgba(255,255,255,0.03)',
  codeBg: 'rgba(255,255,255,0.02)',
}

// SVG icons for the panel (kept local so we don't pollute the main I map)
const AI = {
  spark: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path
        d="M8 2 9.3 5.5l3.5 1.3-3.5 1.3L8 11.6 6.7 8.1 3.2 6.8l3.5-1.3L8 2zM13 11l.6 1.6 1.6.6-1.6.6L13 15.4l-.6-1.6-1.6-.6 1.6-.6L13 11z"
        fill="currentColor"
      />
    </svg>
  ),
  bot: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <rect x="3" y="5" width="10" height="8" rx="2" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="6.5" cy="9" r="1" fill="currentColor" />
      <circle cx="9.5" cy="9" r="1" fill="currentColor" />
      <path
        d="M8 3v2M6.5 13v1M9.5 13v1"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  ),
  brain: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path
        d="M8 2.5C5.5 2.5 4 4 4 6c-.8.5-1.5 1.4-1.5 2.5 0 1 .6 1.9 1.5 2.3V13a1.5 1.5 0 0 0 2.6 1L8 12.5 9.4 14a1.5 1.5 0 0 0 2.6-1v-2.2c.9-.4 1.5-1.3 1.5-2.3 0-1.1-.7-2-1.5-2.5 0-2-1.5-3.5-4-3.5z"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <path d="M8 2.5v10" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  ),
  tool: (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <path
        d="M10 2a3 3 0 0 0-2.6 4.5l-5 5a1.5 1.5 0 0 0 2.1 2.1l5-5A3 3 0 1 0 10 2z"
        stroke="currentColor"
        strokeWidth="1.4"
      />
    </svg>
  ),
  check: (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
      <path
        d="m3 8 3.5 3.5L13 4.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  loader: (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.4" strokeDasharray="4 4" />
    </svg>
  ),
  chevR: (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
      <path d="m6 3 5 5-5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  ),
  chevD: (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
      <path d="m3 6 5 5 5-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  ),
  chevL: (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
      <path d="m10 3-5 5 5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  ),
  chevR2: (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
      <path d="m6 3 5 5-5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  ),
  send: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path
        d="M2 8 14 2.5 11.5 14 8.5 10 2 8z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  ),
  mic: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <rect x="6" y="2" width="4" height="8" rx="2" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M3.5 8a4.5 4.5 0 0 0 9 0M8 12.5V14"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  ),
  attach: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path
        d="m11 4-5.5 5.5a2 2 0 1 0 2.8 2.8L13 7.6a3.5 3.5 0 0 0-5-5L3 8.2"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  ),
  stop: (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
      <rect x="4" y="4" width="8" height="8" rx="1.5" />
    </svg>
  ),
  close: (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
      <path
        d="M3 3l10 10M13 3 3 13"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  ),
  plus: (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
      <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
  panelClose: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M10 3v10M12 6l-1.5 2 1.5 2"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  panelOpen: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M10 3v10M11 6l1.5 2L11 10"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  sidebarClose: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M6 3v10M4 6l1.5 2L4 10"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  sidebarOpen: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M6 3v10M5 6l-1.5 2L5 10"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  clock: (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 4.5V8l2.5 1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
  tokens: (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
      <path d="M4 3h4l4 4v6H4V3z" stroke="currentColor" strokeWidth="1.3" />
      <path d="M8 3v4h4" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  ),
  flow: (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
      <path d="M3 3h4v4H3zM9 9h4v4H9z" stroke="currentColor" strokeWidth="1.3" />
      <path d="M7 5h2a2 2 0 0 1 2 2v2" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  ),
  refresh: (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
      <path
        d="M13 8a5 5 0 0 1-9 3M3 8a5 5 0 0 1 9-3"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M12 2v3h-3M4 14v-3h3"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  copy: (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
      <rect x="5" y="5" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2h-6A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5"
        stroke="currentColor"
        strokeWidth="1.4"
      />
    </svg>
  ),
  thumbUp: (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
      <path
        d="M5 7v6H3V7h2zM5 7l3-5s1.5 0 1.5 1.5V6H13a1.5 1.5 0 0 1 1.5 1.5L13.5 12A1.5 1.5 0 0 1 12 13H5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  ),
  thumbDn: (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
      <path
        d="M11 9V3h2v6h-2zM11 9l-3 5S6.5 14 6.5 12.5V10H3a1.5 1.5 0 0 1-1.5-1.5L2.5 4A1.5 1.5 0 0 1 4 3h7"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  ),
  warn: (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
      <path d="M8 2 14 13H2L8 2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M8 6.5v3M8 11.5v.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
  loop: (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
      <path
        d="M3 5a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="m6 4-2-2 2-2M10 12l2 2-2 2"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
}

// ---------- Small building blocks ----------

const Tag = ({ children, color, bg }) => (
  <span
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 3,
      fontSize: 9.5,
      fontWeight: 600,
      letterSpacing: '0.02em',
      color: color || aiColors.sub,
      background: bg || 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.06)',
      padding: '1.5px 5px',
      borderRadius: 3,
      fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
      textTransform: 'uppercase',
    }}
  >
    {children}
  </span>
)

const Mono = ({ children, c = aiColors.sub }) => (
  <span style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 10, color: c }}>
    {children}
  </span>
)

const TinyBtn = ({ children, onClick, active, danger }) => (
  <button
    onClick={onClick}
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      height: 22,
      padding: '0 7px',
      background: active ? 'rgba(255,255,255,0.06)' : 'transparent',
      color: danger ? '#f87171' : active ? aiColors.text : aiColors.sub,
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 5,
      fontSize: 11,
      fontWeight: 510,
      cursor: 'pointer',
      fontFamily: 'inherit',
    }}
  >
    {children}
  </button>
)

// A single tool-call trace row (collapsible)
const ToolCall = ({ name, module, args, result, status = 'done', duration, open }) => {
  const isOpen = open ?? false
  const statusColor =
    status === 'done' ? '#34d399' : status === 'running' ? 'var(--accent,#7170ff)' : '#f87171'
  return (
    <div
      style={{
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 6,
        background: aiColors.codeBg,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 8px',
          cursor: 'pointer',
        }}
      >
        <span style={{ color: aiColors.muted, display: 'inline-flex' }}>
          {isOpen ? AI.chevD : AI.chevR}
        </span>
        <span style={{ color: statusColor, display: 'inline-flex' }}>
          {status === 'running' ? AI.loader : status === 'done' ? AI.check : AI.warn}
        </span>
        <span style={{ color: aiColors.muted, display: 'inline-flex' }}>{AI.tool}</span>
        <span
          style={{
            fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
            fontSize: 11,
            color: aiColors.text,
          }}
        >
          <span style={{ color: aiColors.muted }}>{module}.</span>
          {name}
        </span>
        <div style={{ flex: 1 }} />
        {duration && <Mono c={aiColors.muted}>{duration}ms</Mono>}
      </div>
      {isOpen && (
        <div
          style={{
            borderTop: '1px solid rgba(255,255,255,0.06)',
            padding: 8,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          {args && (
            <div>
              <div
                style={{
                  fontSize: 9.5,
                  color: aiColors.muted,
                  fontWeight: 600,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  marginBottom: 3,
                }}
              >
                input
              </div>
              <pre
                style={{
                  margin: 0,
                  padding: '6px 8px',
                  background: 'rgba(0,0,0,0.3)',
                  borderRadius: 4,
                  fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
                  fontSize: 10.5,
                  color: '#d0d6e0',
                  whiteSpace: 'pre-wrap',
                  lineHeight: 1.5,
                }}
              >
                {args}
              </pre>
            </div>
          )}
          {result && (
            <div>
              <div
                style={{
                  fontSize: 9.5,
                  color: aiColors.muted,
                  fontWeight: 600,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  marginBottom: 3,
                }}
              >
                output
              </div>
              <pre
                style={{
                  margin: 0,
                  padding: '6px 8px',
                  background: 'rgba(0,0,0,0.3)',
                  borderRadius: 4,
                  fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
                  fontSize: 10.5,
                  color: '#d0d6e0',
                  whiteSpace: 'pre-wrap',
                  lineHeight: 1.5,
                }}
              >
                {result}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Plan card — the deterministic router output (§3 topology)
const AgentPlanCard = ({ intent, flow, subAgent, topology = 'direct', iteration }) => (
  <div
    style={{
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 6,
      background: 'linear-gradient(180deg, rgba(113,112,255,0.05), transparent)',
      padding: 8,
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ color: 'var(--accent,#7170ff)', display: 'inline-flex' }}>{AI.brain}</span>
      <span style={{ fontSize: 11, fontWeight: 600, color: aiColors.text }}>Plan</span>
      <Tag color="#9ea2ff" bg="rgba(113,112,255,0.08)">
        {topology}
      </Tag>
      {iteration && (
        <Tag color="#fbbf24" bg="rgba(251,191,36,0.08)">
          {AI.loop} iter {iteration}
        </Tag>
      )}
      <div style={{ flex: 1 }} />
      <Mono>
        {AI.flow} {flow}
      </Mono>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <Mono c="#d0d6e0">
        intent_slug: <span style={{ color: 'var(--accent,#7170ff)' }}>{intent}</span>
      </Mono>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ color: aiColors.muted, fontSize: 11 }}>route →</span>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '2px 7px',
          borderRadius: 4,
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.08)',
          fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
          fontSize: 11,
          color: aiColors.text,
        }}
      >
        <span style={{ color: 'var(--accent,#7170ff)', display: 'inline-flex' }}>{AI.bot}</span>
        {subAgent}
      </span>
    </div>
  </div>
)

// Draft approval card — plan 08 DraftCard for write ops (`proposed` state)
const DraftCard = ({ title, kind, module, fields, warnings, state = 'proposed' }) => {
  const stateColor = state === 'proposed' ? '#fbbf24' : state === 'approved' ? '#34d399' : '#f87171'
  return (
    <div
      style={{
        border: '1px solid rgba(251,191,36,0.25)',
        borderRadius: 7,
        background: 'linear-gradient(180deg, rgba(251,191,36,0.04), rgba(251,191,36,0.01))',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '7px 9px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: 3,
            background: stateColor,
            display: 'inline-block',
            boxShadow: `0 0 0 3px ${stateColor}22`,
          }}
        />
        <span style={{ fontSize: 11, fontWeight: 600, color: aiColors.text }}>
          Draft · awaiting you
        </span>
        <Tag color={stateColor} bg={`${stateColor}14`}>
          {state}
        </Tag>
        <div style={{ flex: 1 }} />
        <Mono>
          {module}.{kind}
        </Mono>
      </div>
      <div style={{ padding: '9px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 510, color: aiColors.text, lineHeight: 1.4 }}>
          {title}
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '80px 1fr',
            rowGap: 4,
            columnGap: 8,
            fontSize: 11,
          }}
        >
          {fields.map((f, i) => (
            <React.Fragment key={i}>
              <div
                style={{
                  color: aiColors.muted,
                  fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
                  fontSize: 10.5,
                }}
              >
                {f.key}
              </div>
              <div style={{ color: aiColors.text, display: 'flex', alignItems: 'center', gap: 6 }}>
                {f.value}
              </div>
            </React.Fragment>
          ))}
        </div>
        {warnings && warnings.length > 0 && (
          <div
            style={{
              display: 'flex',
              gap: 6,
              alignItems: 'flex-start',
              padding: '6px 8px',
              background: 'rgba(251,191,36,0.06)',
              border: '1px solid rgba(251,191,36,0.15)',
              borderRadius: 5,
            }}
          >
            <span style={{ color: '#fbbf24', display: 'inline-flex', paddingTop: 1 }}>
              {AI.warn}
            </span>
            <div style={{ fontSize: 10.5, color: '#d0d6e0', lineHeight: 1.5, flex: 1 }}>
              {warnings.map((w, i) => (
                <div key={i}>{w}</div>
              ))}
            </div>
          </div>
        )}
        {state === 'proposed' && (
          <div style={{ display: 'flex', gap: 6, paddingTop: 2 }}>
            <button
              style={{
                flex: 1,
                height: 28,
                borderRadius: 5,
                border: 'none',
                background: 'var(--accent,#7170ff)',
                color: '#fff',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 5,
              }}
            >
              {AI.check}Approve &amp; apply
            </button>
            <button
              style={{
                height: 28,
                padding: '0 10px',
                borderRadius: 5,
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.1)',
                color: aiColors.sub,
                fontSize: 11,
                fontWeight: 510,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Edit
            </button>
            <button
              style={{
                height: 28,
                padding: '0 10px',
                borderRadius: 5,
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.1)',
                color: aiColors.muted,
                fontSize: 11,
                fontWeight: 510,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Discard
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// User turn
const UserTurn = ({ children }) => (
  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
    <div
      style={{
        maxWidth: '84%',
        padding: '7px 10px',
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: '10px 10px 3px 10px',
        fontSize: 12.5,
        color: aiColors.text,
        lineHeight: 1.5,
        letterSpacing: '-0.005em',
      }}
    >
      {children}
    </div>
  </div>
)

// Agent turn container — wraps plan, tool calls, answer
const AgentTurn = ({ children, time, inFlight }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 2px' }}>
      <div
        style={{
          width: 18,
          height: 18,
          borderRadius: 4,
          background: 'linear-gradient(135deg, var(--accent,#7170ff), #9ea2ff)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
        }}
      >
        {AI.spark}
      </div>
      <span style={{ fontSize: 11, fontWeight: 600, color: aiColors.text }}>Agent</span>
      {inFlight && (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 10,
            color: 'var(--accent,#7170ff)',
            fontWeight: 510,
          }}
        >
          <span
            style={{
              width: 5,
              height: 5,
              borderRadius: 3,
              background: 'var(--accent,#7170ff)',
              animation: 'aiPulse 1s ease-in-out infinite',
            }}
          />
          streaming
        </span>
      )}
      <div style={{ flex: 1 }} />
      {time && <Mono c={aiColors.muted}>{time}</Mono>}
    </div>
    <div style={{ paddingLeft: 24, display: 'flex', flexDirection: 'column', gap: 6 }}>
      {children}
    </div>
  </div>
)

// Answer bubble (streamed tokens)
const AnswerBubble = ({ children, caret }) => (
  <div
    style={{
      padding: '6px 0',
      fontSize: 12.5,
      color: aiColors.text,
      lineHeight: 1.55,
      letterSpacing: '-0.005em',
    }}
  >
    {children}
    {caret && (
      <span
        style={{
          display: 'inline-block',
          width: 7,
          height: 13,
          marginLeft: 2,
          verticalAlign: '-2px',
          background: 'var(--accent,#7170ff)',
          animation: 'aiBlink 0.9s steps(2,end) infinite',
        }}
      />
    )}
  </div>
)

// Action response row
const ActionFooter = () => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      paddingTop: 2,
      color: aiColors.muted,
    }}
  >
    <button style={{ ...iconBtn }}>{AI.copy}</button>
    <button style={{ ...iconBtn }}>{AI.refresh}</button>
    <button style={{ ...iconBtn }}>{AI.thumbUp}</button>
    <button style={{ ...iconBtn }}>{AI.thumbDn}</button>
    <div style={{ flex: 1 }} />
    <Mono>84 tokens · 1.2s</Mono>
  </div>
)

const iconBtn = {
  width: 22,
  height: 22,
  borderRadius: 4,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'transparent',
  border: 'none',
  color: aiColors.muted,
  cursor: 'pointer',
}

// ---------- The panel ----------

const AIChatPanel = ({ state = 'idle', width = 360, onCollapse, taskContext }) => {
  return (
    <aside
      style={{
        width,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        background: aiColors.panel,
        borderLeft: `1px solid ${aiColors.line}`,
        minHeight: 0,
        height: '100%',
        position: 'relative',
      }}
    >
      <style>{`
        @keyframes aiPulse { 0%,100% { opacity: 0.4; transform: scale(0.8);} 50% { opacity: 1; transform: scale(1.15);} }
        @keyframes aiBlink { 0%,50% { opacity: 1;} 51%,100% { opacity: 0;} }
        @keyframes aiShimmer { 0% { background-position: -200px 0;} 100% { background-position: 200px 0;} }
      `}</style>

      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '0 10px',
          height: 44,
          borderBottom: `1px solid ${aiColors.line}`,
        }}
      >
        <div
          style={{
            width: 22,
            height: 22,
            borderRadius: 5,
            background: 'linear-gradient(135deg, var(--accent,#7170ff), #9ea2ff)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
          }}
        >
          {AI.spark}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: aiColors.text,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            Action Intelligence
            <Tag color="#34d399" bg="rgba(52,211,153,0.08)">
              live
            </Tag>
          </div>
          {taskContext && (
            <div
              style={{
                fontSize: 10,
                color: aiColors.muted,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              on · {taskContext}
            </div>
          )}
        </div>
        <button style={{ ...iconBtn, width: 24, height: 24 }} title="New thread">
          {AI.plus}
        </button>
        <button style={{ ...iconBtn, width: 24, height: 24 }} onClick={onCollapse} title="Collapse">
          {AI.panelClose}
        </button>
      </div>

      {/* Sub-header: thread meta */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 10px',
          borderBottom: `1px solid ${aiColors.line}`,
          background: 'rgba(255,255,255,0.01)',
        }}
      >
        <Mono>{AI.flow} flow_7c…be</Mono>
        <span style={{ color: aiColors.muted }}>·</span>
        <Mono c="#d0d6e0">claude-sonnet-4.5</Mono>
        <div style={{ flex: 1 }} />
        <Mono>{AI.tokens} 4.2k</Mono>
        <Mono>{AI.clock} $0.019</Mono>
      </div>

      {/* Scroll region with the turns */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          padding: '12px 10px',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <AIContent state={state} />
      </div>

      {/* Composer */}
      <AIComposer state={state} />
    </aside>
  )
}

// ------------------ Per-state content ------------------

const AIContent = ({ state }) => {
  if (state === 'idle') return <AIContentIdle />
  if (state === 'streaming') return <AIContentStreaming />
  if (state === 'draft') return <AIContentDraft />
  if (state === 'iteration') return <AIContentIteration />
  if (state === 'collapsed') return null
  return <AIContentIdle />
}

// ----- Idle / empty state -----
const AIContentIdle = () => (
  <>
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        alignItems: 'center',
        padding: '18px 10px',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background: 'linear-gradient(135deg, rgba(113,112,255,0.2), rgba(113,112,255,0.06))',
          border: '1px solid rgba(113,112,255,0.2)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--accent,#7170ff)',
        }}
      >
        {AI.spark}
      </div>
      <div
        style={{ fontSize: 13, fontWeight: 510, color: aiColors.text, letterSpacing: '-0.01em' }}
      >
        Ask about this plan
      </div>
      <div style={{ fontSize: 11, color: aiColors.sub, lineHeight: 1.5, maxWidth: 260 }}>
        I can triage buckets, draft tasks from meeting notes, find blockers, roll up status, and
        assign work. Writes always land as approvable drafts.
      </div>
    </div>

    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div
        style={{
          fontSize: 9.5,
          fontWeight: 600,
          color: aiColors.muted,
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          padding: '0 2px 2px',
        }}
      >
        Suggested
      </div>
      {[
        { slug: 'planner.triage_bucket', text: "What's slipping this week in Q1 Launch?" },
        { slug: 'planner.create_from_notes', text: 'Turn the Tuesday standup notes into tasks' },
        { slug: 'people.find_blocker', text: "Who's blocked on design system v3?" },
        { slug: 'planner.rollup_status', text: "Summarise my team's progress for the PMO digest" },
      ].map((s, i) => (
        <button
          key={i}
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 7,
            padding: '7px 9px',
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.05)',
            borderRadius: 6,
            cursor: 'pointer',
            textAlign: 'left',
            fontFamily: 'inherit',
          }}
        >
          <span style={{ fontSize: 12.5, color: aiColors.text, flex: 1, lineHeight: 1.4 }}>
            {s.text}
          </span>
          <Mono>{s.slug}</Mono>
        </button>
      ))}
    </div>

    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        padding: '6px 2px 0',
        borderTop: `1px solid ${aiColors.line}`,
        paddingTop: 12,
      }}
    >
      <div
        style={{
          fontSize: 9.5,
          fontWeight: 600,
          color: aiColors.muted,
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          padding: '0 2px 2px',
        }}
      >
        Recent threads
      </div>
      {[
        { t: 'Draft Q1 retro action items', m: '12m ago', s: 3 },
        { t: 'Find overdue in Hiring Q2', m: '2h ago', s: 1 },
        { t: 'Re-bucket frontend work', m: 'yesterday', s: 5 },
      ].map((t, i) => (
        <button
          key={i}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '5px 6px',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            textAlign: 'left',
            fontFamily: 'inherit',
            borderRadius: 4,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 11.5,
                color: aiColors.text,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {t.t}
            </div>
            <div style={{ fontSize: 10, color: aiColors.muted }}>
              {t.m} · {t.s} turns
            </div>
          </div>
          <span style={{ color: aiColors.muted, display: 'inline-flex' }}>{AI.chevR2}</span>
        </button>
      ))}
    </div>
  </>
)

// ----- Streaming state (with tool calls, then answer) -----
const AIContentStreaming = () => (
  <>
    <UserTurn>
      What's slipping this week in Q1 Launch? Pull anything high-priority that's due in the next 3
      days.
    </UserTurn>
    <AgentTurn inFlight>
      <AgentPlanCard
        intent="planner.triage_bucket"
        flow="flow_7c2a…be"
        subAgent="planner_sub_agent"
        topology="bounded-dag"
      />
      <ToolCall
        module="planner"
        name="queryTasks"
        status="done"
        duration={142}
        open
        args={`{
  "plan_id": "q1-launch",
  "due_before": "2026-04-25",
  "priority": [">=", "high"],
  "progress": ["<", 100]
}`}
        result={`[
  { id: "t-341", title: "Ship composer onboarding tour",
    owner: "EM", due: "2026-04-23", priority: "urgent",
    progress: 40, bucket: "In progress", slip: 2 },
  { id: "t-358", title: "Sync permission narrative w/ planner",
    owner: "TH", due: "2026-04-24", priority: "high",
    progress: 70, bucket: "Review", slip: 0 },
  { id: "t-362", title: "SSO lockout escalation runbook",
    owner: "JM", due: "2026-04-22", priority: "urgent",
    progress: 10, bucket: "Blocked", slip: 5 },
  ... 4 more
]`}
      />
      <ToolCall
        module="people"
        name="capacityFor"
        status="done"
        duration={88}
        args={`{ user_ids: ["EM","TH","JM"], window_days: 3 }`}
      />
      <ToolCall module="planner" name="rankBlockers" status="running" />
      <AnswerBubble caret>
        <span style={{ color: aiColors.muted }}>
          7 tasks in Q1 Launch are either overdue or due before Friday.
        </span>{' '}
        The most at-risk is{' '}
        <span
          style={{
            background: 'rgba(113,112,255,0.12)',
            padding: '1px 5px',
            borderRadius: 3,
            color: 'var(--accent,#7170ff)',
            fontWeight: 510,
          }}
        >
          SSO lockout escalation runbook
        </span>{' '}
        — 10% progress, urgent, and 5 days slipped. Owner JM is at capacity this week
      </AnswerBubble>
    </AgentTurn>
  </>
)

// ----- Draft approval state -----
const AIContentDraft = () => (
  <>
    <UserTurn>
      Turn this into 3 tasks for the design system v3 plan and assign HL as owner.
    </UserTurn>
    <AgentTurn time="just now">
      <AgentPlanCard
        intent="planner.create_from_notes"
        flow="flow_a41e…09"
        subAgent="planner_sub_agent"
        topology="direct"
      />
      <ToolCall module="planner" name="parseBrief" status="done" duration={98} />
      <ToolCall module="people" name="resolveOwner" status="done" duration={33} />
      <AnswerBubble>
        <span style={{ color: aiColors.muted }}>
          Parsed 3 action items from the notes. I've drafted them against
        </span>{' '}
        <span style={{ color: aiColors.text }}>Design system v3</span>{' '}
        <span style={{ color: aiColors.muted }}>
          with HL as owner. Review and approve to apply.
        </span>
      </AnswerBubble>
      <DraftCard
        title="Refactor token export pipeline to emit both CSS and JS bindings"
        kind="task.create"
        module="planner"
        state="proposed"
        fields={[
          { key: 'plan', value: <span>Design system v3</span> },
          { key: 'bucket', value: <span>Backlog</span> },
          {
            key: 'owner',
            value: (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <span
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: 7,
                    background: '#10b981',
                    display: 'inline-block',
                  }}
                />
                Hoang Long
              </span>
            ),
          },
          { key: 'priority', value: <span style={{ color: '#f59e0b' }}>High</span> },
          { key: 'due', value: <span>May 8, 2026</span> },
          {
            key: 'labels',
            value: (
              <span style={{ display: 'inline-flex', gap: 4 }}>
                <span
                  style={{
                    fontSize: 10,
                    padding: '0 5px',
                    borderRadius: 3,
                    background: 'rgba(6,182,212,0.12)',
                    color: '#22d3ee',
                  }}
                >
                  tokens
                </span>
                <span
                  style={{
                    fontSize: 10,
                    padding: '0 5px',
                    borderRadius: 3,
                    background: 'rgba(236,72,153,0.12)',
                    color: '#f472b6',
                  }}
                >
                  build
                </span>
              </span>
            ),
          },
        ]}
        warnings={['HL already owns 6 high-priority tasks this week; consider TH as alternate.']}
      />
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 8px',
          background: 'rgba(255,255,255,0.02)',
          border: '1px dashed rgba(255,255,255,0.07)',
          borderRadius: 5,
          fontSize: 10.5,
          color: aiColors.muted,
        }}
      >
        <span style={{ color: aiColors.muted, display: 'inline-flex' }}>{AI.chevD}</span>2 more
        drafts below
      </div>
      <ActionFooter />
    </AgentTurn>
  </>
)

// ----- Iterative topology state -----
const AIContentIteration = () => (
  <>
    <UserTurn>
      Roll up status across the 3 engineering plans — who's on track, who needs help?
    </UserTurn>
    <AgentTurn inFlight>
      <AgentPlanCard
        intent="planner.rollup_status"
        flow="flow_b801…24"
        subAgent="supervisor"
        topology="iterative"
        iteration="2/3"
      />
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 0,
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 6,
          overflow: 'hidden',
        }}
      >
        {[
          {
            n: 1,
            title: 'Enumerate plans and their owners',
            status: 'done',
            tools: 2,
            tokens: '320',
          },
          {
            n: 2,
            title: 'Fan out: per-plan risk assessment',
            status: 'running',
            tools: 3,
            tokens: '810',
          },
          {
            n: 3,
            title: 'Synthesize rollup + recommendations',
            status: 'queued',
            tools: 0,
            tokens: '—',
          },
        ].map((it, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '7px 9px',
              borderTop: i > 0 ? '1px solid rgba(255,255,255,0.05)' : 'none',
              background: it.status === 'running' ? 'rgba(113,112,255,0.04)' : 'transparent',
            }}
          >
            <div
              style={{
                width: 18,
                height: 18,
                borderRadius: 4,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                background:
                  it.status === 'done'
                    ? 'rgba(52,211,153,0.12)'
                    : it.status === 'running'
                      ? 'rgba(113,112,255,0.14)'
                      : 'rgba(255,255,255,0.04)',
                color:
                  it.status === 'done'
                    ? '#34d399'
                    : it.status === 'running'
                      ? 'var(--accent,#7170ff)'
                      : aiColors.muted,
                fontSize: 10,
                fontWeight: 600,
              }}
            >
              {it.status === 'done' ? AI.check : it.n}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11.5, color: aiColors.text, fontWeight: 510 }}>
                {it.title}
              </div>
              <div style={{ fontSize: 10, color: aiColors.muted, display: 'flex', gap: 8 }}>
                <span>iter {it.n}</span>
                <span>·</span>
                <span>{it.tools} tools</span>
                <span>·</span>
                <span>{it.tokens} tok</span>
              </div>
            </div>
            {it.status === 'running' && (
              <span
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: 3,
                  background: 'var(--accent,#7170ff)',
                  animation: 'aiPulse 1s ease-in-out infinite',
                }}
              />
            )}
          </div>
        ))}
      </div>
      <AnswerBubble>
        <span style={{ color: aiColors.muted }}>
          Hiring Q2 is on track (88% burndown). Q1 Launch has 7 slipping tasks concentrated in JM.
        </span>{' '}
        Still checking Design system v3…
      </AnswerBubble>
    </AgentTurn>
  </>
)

// ---------- Composer ----------

const AIComposer = ({ state }) => {
  const inFlight = state === 'streaming' || state === 'iteration'
  return (
    <div style={{ borderTop: `1px solid ${aiColors.line}`, background: aiColors.panel }}>
      {/* Context chips */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          padding: '6px 10px',
          borderBottom: '1px solid rgba(255,255,255,0.03)',
        }}
      >
        <Mono c={aiColors.muted}>context</Mono>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 10.5,
            padding: '1.5px 6px',
            borderRadius: 3,
            background: 'rgba(113,112,255,0.08)',
            border: '1px solid rgba(113,112,255,0.18)',
            color: 'var(--accent,#7170ff)',
          }}
        >
          plan · Q1 Launch <span style={{ color: '#7170ff99' }}>×</span>
        </span>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 10.5,
            padding: '1.5px 6px',
            borderRadius: 3,
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.06)',
            color: aiColors.sub,
          }}
        >
          view · board <span style={{ color: aiColors.muted }}>×</span>
        </span>
        <button
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 3,
            height: 18,
            padding: '0 5px',
            background: 'transparent',
            border: '1px dashed rgba(255,255,255,0.08)',
            borderRadius: 3,
            color: aiColors.muted,
            fontSize: 10,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {AI.plus}add
        </button>
      </div>

      {/* Text input */}
      <div
        style={{
          padding: '8px 10px',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        <div
          style={{
            background: 'rgba(255,255,255,0.02)',
            border: `1px solid ${inFlight ? 'rgba(113,112,255,0.25)' : aiColors.line2}`,
            borderRadius: 7,
            padding: '8px 10px',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            ...(inFlight ? { boxShadow: '0 0 0 3px rgba(113,112,255,0.08)' } : {}),
          }}
        >
          <div
            style={{
              fontSize: 12.5,
              color: inFlight ? aiColors.muted : '#d0d6e0',
              lineHeight: 1.5,
              minHeight: 18,
            }}
          >
            {inFlight ? (
              <span style={{ color: aiColors.muted }}>Waiting for agent to finish…</span>
            ) : (
              <span style={{ color: aiColors.muted }}>
                Ask anything ·{' '}
                <span style={{ color: '#575b63' }}>/task, /rollup, @person, #plan</span>
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button style={{ ...iconBtn }}>{AI.attach}</button>
            <button style={{ ...iconBtn }}>{AI.mic}</button>
            <TinyBtn>claude-sonnet-4.5 {AI.chevD}</TinyBtn>
            <div style={{ flex: 1 }} />
            {inFlight ? (
              <button
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  height: 26,
                  padding: '0 10px',
                  borderRadius: 5,
                  background: 'rgba(248,113,113,0.08)',
                  border: '1px solid rgba(248,113,113,0.3)',
                  color: '#f87171',
                  fontSize: 11,
                  fontWeight: 510,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {AI.stop}Stop
              </button>
            ) : (
              <button
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  height: 26,
                  padding: '0 10px',
                  borderRadius: 5,
                  background: 'var(--accent,#7170ff)',
                  border: 'none',
                  color: '#fff',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Send {AI.send}
              </button>
            )}
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '0 2px',
            fontSize: 10,
            color: aiColors.muted,
          }}
        >
          <span>Writes require approval</span>
          <span>·</span>
          <span>⌘↵ send</span>
          <div style={{ flex: 1 }} />
          <span>8/24k ctx</span>
        </div>
      </div>
    </div>
  )
}

// ---------- Collapsed icon rail for chat ----------

const AIChatRail = ({ onExpand }) => (
  <aside
    style={{
      width: 44,
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      background: aiColors.panel,
      borderLeft: `1px solid ${aiColors.line}`,
      padding: '10px 0',
      gap: 6,
    }}
  >
    <button
      onClick={onExpand}
      title="Open Action Intelligence"
      style={{
        width: 28,
        height: 28,
        borderRadius: 6,
        background: 'linear-gradient(135deg, var(--accent,#7170ff), #9ea2ff)',
        border: 'none',
        color: '#fff',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {AI.spark}
    </button>
    <div style={{ height: 1, width: 22, background: aiColors.line, margin: '2px 0' }} />
    {[AI.bot, AI.tool, AI.brain].map((ic, i) => (
      <button
        key={i}
        style={{
          width: 28,
          height: 28,
          borderRadius: 6,
          background: 'transparent',
          border: 'none',
          color: aiColors.sub,
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {ic}
      </button>
    ))}
    <div style={{ flex: 1 }} />
    <div
      style={{
        width: 6,
        height: 6,
        borderRadius: 3,
        background: 'var(--accent,#7170ff)',
        boxShadow: '0 0 0 3px rgba(113,112,255,0.2)',
      }}
      title="Active thread"
    />
  </aside>
)

Object.assign(window, { AIChatPanel, AIChatRail, AI_COLORS: aiColors, AI_ICONS: AI })
