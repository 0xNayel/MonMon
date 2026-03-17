import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import api from '../api'

// ── API types ──────────────────────────────────────────────────────────────────
interface DiffSection {
  url: string
  has_changes: boolean
  added: number
  removed: number
  diff: string
}
interface DiffData {
  is_multi: boolean
  diff?: string              // single-output
  sections?: DiffSection[]   // multi-URL (endpoint)
  total_added?: number
  total_removed?: number
  first_time_lines?: string[] // single-output: content of first-time-added lines
  first_time_added?: number   // single-output: count
}

// ── Line renderer ──────────────────────────────────────────────────────────────
function lineStyle(line: string): { bg: string; fg: string } {
  if (line[0] === '+') return { bg: 'rgba(34,197,94,0.08)',  fg: '#4ade80'  }
  if (line[0] === '-') return { bg: 'rgba(255,59,92,0.08)',  fg: '#FF3B5C'  }
  if (line.startsWith('@@')) return { bg: 'rgba(56,189,248,0.04)', fg: '#38BDF8' }
  return { bg: 'transparent', fg: 'var(--text-primary)' }
}

function DiffBlock({
  text,
  changedOnly,
  firstTimeSet,
}: {
  text: string
  changedOnly?: boolean
  firstTimeSet?: Set<string>
}) {
  const lines = useMemo(() => {
    const raw = text.split('\n')

    // First-time mode: show only + lines that are in the firstTimeSet
    if (firstTimeSet !== undefined) {
      const out: string[] = []
      let gap = false
      for (const l of raw) {
        if (l[0] === '+' && !l.startsWith('+++')) {
          if (firstTimeSet.has(l.slice(1))) {
            gap = false
            out.push(l)
          } else {
            if (!gap) out.push('···')
            gap = true
          }
        } else {
          if (!gap) out.push('···')
          gap = true
        }
      }
      while (out[0] === '···') out.shift()
      while (out[out.length - 1] === '···') out.pop()
      return out
    }

    if (!changedOnly) return raw
    // Changed-only mode: keep +/- lines, collapse context into ···
    const out: string[] = []
    let gap = false
    for (const l of raw) {
      if (l[0] === '+' || l[0] === '-') { gap = false; out.push(l) }
      else { if (!gap) out.push('···'); gap = true }
    }
    while (out[0] === '···') out.shift()
    while (out[out.length - 1] === '···') out.pop()
    return out
  }, [text, changedOnly, firstTimeSet])

  return (
    <pre style={{ margin: 0, padding: 0, fontFamily: 'var(--font-mono)', fontSize: 13, lineHeight: 1.6 }}>
      {lines.map((line, i) => {
        if (line === '···') return (
          <div key={i} style={{ padding: '1px 14px', color: 'var(--text-faint)', fontSize: 11 }}>···</div>
        )
        const { bg, fg } = lineStyle(line)
        return (
          <div key={i} style={{ display: 'flex', background: bg }}>
            <span style={{ width: 44, textAlign: 'right', padding: '2px 10px', color: 'var(--text-faint)', fontSize: 11, flexShrink: 0, borderRight: '1px solid var(--border-subtle)', userSelect: 'none' }}>
              {i + 1}
            </span>
            <span style={{ padding: '2px 14px', color: fg, whiteSpace: 'pre' }}>{line}</span>
          </div>
        )
      })}
    </pre>
  )
}

// ── Button styles ──────────────────────────────────────────────────────────────
const BASE_BTN: React.CSSProperties = {
  padding: '6px 14px', borderRadius: 8, cursor: 'pointer', outline: 'none',
  fontFamily: 'var(--font-mono)', fontSize: 12, border: '1px solid var(--border)',
  background: 'rgba(255,255,255,0.04)', color: 'var(--text-muted)', transition: 'all 0.15s',
}
function btn(active: boolean, color: 'indigo' | 'green' | 'amber' = 'indigo'): React.CSSProperties {
  if (!active) return BASE_BTN
  if (color === 'green')
    return { ...BASE_BTN, background: 'rgba(34,197,94,0.1)',   color: '#4ade80',  border: '1px solid rgba(34,197,94,0.25)'  }
  if (color === 'amber')
    return { ...BASE_BTN, background: 'rgba(251,191,36,0.1)',  color: '#FBBF24',  border: '1px solid rgba(251,191,36,0.25)' }
  return   { ...BASE_BTN, background: 'var(--accent-dim)',     color: 'var(--accent)', border: '1px solid rgba(99,102,241,0.25)' }
}

const INPUT_STYLE: React.CSSProperties = {
  padding: '6px 12px', border: '1px solid var(--border)', borderRadius: 8,
  background: 'rgba(255,255,255,0.04)', color: 'var(--text-primary)',
  fontFamily: 'var(--font-body)', fontSize: 13, outline: 'none', width: 200,
}

// ── Main ───────────────────────────────────────────────────────────────────────
export default function DiffView() {
  const { id } = useParams()
  const [data,    setData]    = useState<DiffData | null>(null)
  const [loading, setLoading] = useState(true)

  const [endpointTab, setEndpointTab] = useState<'all' | 'changed'>('changed')
  const [linesTab,    setLinesTab]    = useState<'all' | 'changed' | 'firsttime'>('all')
  const [search,      setSearch]      = useState('')
  const [openMap,     setOpenMap]     = useState<Record<string, boolean>>({})

  useEffect(() => {
    setLoading(true)
    api.get(`/checks/${id}/diff`)
      .then(r  => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [id])

  const sections     = data?.sections ?? []
  const changedCount = sections.filter(s => s.has_changes).length
  const totalAdded   = data?.total_added   ?? 0
  const totalRemoved = data?.total_removed ?? 0
  const firstTimeAdded = data?.first_time_added ?? 0

  // Set of first-time line contents for fast lookup in DiffBlock
  const firstTimeSet = useMemo(
    () => new Set<string>(data?.first_time_lines ?? []),
    [data?.first_time_lines]
  )

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return sections.filter(s => {
      if (endpointTab === 'changed' && !s.has_changes) return false
      if (q && !s.url.toLowerCase().includes(q)) return false
      return true
    })
  }, [sections, endpointTab, search])

  const isOpen = (url: string, hasChanges: boolean) => url in openMap ? openMap[url] : hasChanges
  const toggle = (url: string, hasChanges: boolean) =>
    setOpenMap(p => ({ ...p, [url]: !isOpen(url, hasChanges) }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Header */}
      <div>
        <button
          onClick={() => history.back()}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-body)', display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 10 }}
        >← Back</button>

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14 }}>

          {/* Title */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700 }}>
                Diff — Check #{id}
              </h2>
              {!loading && totalAdded   > 0 && <span style={{ padding: '3px 10px', background: 'rgba(34,197,94,0.1)',  color: '#4ade80',  border: '1px solid rgba(34,197,94,0.25)',  borderRadius: 6, fontSize: 12, fontFamily: 'var(--font-mono)', fontWeight: 600 }}>+{totalAdded}</span>}
              {!loading && totalRemoved > 0 && <span style={{ padding: '3px 10px', background: 'rgba(255,59,92,0.1)', color: '#FF3B5C', border: '1px solid rgba(255,59,92,0.25)', borderRadius: 6, fontSize: 12, fontFamily: 'var(--font-mono)', fontWeight: 600 }}>-{totalRemoved}</span>}
              {!loading && !data?.is_multi && firstTimeAdded > 0 && (
                <span style={{ padding: '3px 10px', background: 'rgba(251,191,36,0.1)', color: '#FBBF24', border: '1px solid rgba(251,191,36,0.25)', borderRadius: 6, fontSize: 12, fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                  {firstTimeAdded} new
                </span>
              )}
            </div>
            {data?.is_multi && !loading && (
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>
                {sections.length} endpoints · {changedCount} changed
              </p>
            )}
          </div>

          {/* Controls — multi-URL only */}
          {data?.is_multi && !loading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>

              {/* Row 1: search + endpoint tabs */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search URLs…"
                  style={INPUT_STYLE}
                />
                <button style={btn(endpointTab === 'all')}             onClick={() => setEndpointTab('all')}>
                  All ({sections.length})
                </button>
                <button style={btn(endpointTab === 'changed', 'green')} onClick={() => setEndpointTab('changed')}>
                  Changed ({changedCount})
                </button>
              </div>

              {/* Row 2: lines sub-filter */}
              {endpointTab === 'changed' && changedCount > 0 && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>lines:</span>
                  <button style={btn(linesTab === 'all')}             onClick={() => setLinesTab('all')}>All lines</button>
                  <button style={btn(linesTab === 'changed', 'green')} onClick={() => setLinesTab('changed')}>Changed only</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Body */}
      {loading ? (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 24 }}>
          {[...Array(8)].map((_, i) => (
            <div key={i} style={{ display: 'flex', gap: 16, marginBottom: 10 }}>
              <div className="skeleton" style={{ height: 13, width: 32, flexShrink: 0 }} />
              <div className="skeleton" style={{ height: 13, width: `${45 + i * 6}%` }} />
            </div>
          ))}
        </div>

      ) : data?.is_multi ? (
        /* ── Multi-URL (endpoint) ───────────────────────────────────────────── */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {visible.length === 0 ? (
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
              No endpoints match
            </div>
          ) : visible.map(s => {
            const open_ = isOpen(s.url, s.has_changes)
            return (
              <div
                key={s.url}
                style={{
                  background: s.has_changes ? 'rgba(255,255,255,0.03)' : 'var(--bg-card)',
                  border: s.has_changes ? '1px solid rgba(99,102,241,0.2)' : '1px solid var(--border)',
                  borderRadius: 12, overflow: 'hidden',
                }}
              >
                <button
                  onClick={() => toggle(s.url, s.has_changes)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 16px', background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.url}
                    </span>
                    {!s.has_changes && (
                      <span style={{ padding: '2px 8px', background: 'rgba(255,255,255,0.05)', color: 'var(--text-faint)', borderRadius: 4, fontSize: 11, flexShrink: 0 }}>
                        no change
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, marginLeft: 10 }}>
                    {s.added   > 0 && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#4ade80'  }}>+{s.added}</span>}
                    {s.removed > 0 && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#FF3B5C' }}>-{s.removed}</span>}
                    <span style={{ color: 'var(--text-faint)', fontSize: 14, display: 'inline-block', transform: open_ ? 'none' : 'rotate(-90deg)', transition: 'transform 0.2s' }}>∨</span>
                  </div>
                </button>

                {open_ && (
                  <div style={{ borderTop: '1px solid var(--border-subtle)', overflowX: 'auto' }}>
                    {s.diff
                      ? <DiffBlock text={s.diff} changedOnly={linesTab === 'changed'} />
                      : <div style={{ padding: '12px 16px', color: 'var(--text-faint)', fontSize: 12, fontFamily: 'var(--font-mono)' }}>No diff</div>
                    }
                  </div>
                )}
              </div>
            )
          })}
        </div>

      ) : (
        /* ── Single / flat (command / subdomain / bbscope) ─────────────────── */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Lines filter — only shown when there is at least one first-time line */}
          {(data?.diff || firstTimeAdded > 0) && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>lines:</span>
              <button style={btn(linesTab === 'all')}             onClick={() => setLinesTab('all')}>All lines</button>
              <button style={btn(linesTab === 'changed', 'green')} onClick={() => setLinesTab('changed')}>Changed only</button>
              {firstTimeAdded > 0 && (
                <button style={btn(linesTab === 'firsttime', 'amber')} onClick={() => setLinesTab('firsttime')}>
                  First time ({firstTimeAdded})
                </button>
              )}
            </div>
          )}

          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              {data?.diff
                ? <DiffBlock
                    text={data.diff}
                    changedOnly={linesTab === 'changed'}
                    firstTimeSet={linesTab === 'firsttime' ? firstTimeSet : undefined}
                  />
                : <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>No diff available</div>
              }
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
