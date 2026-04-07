import { useEffect, useRef, useState, useCallback } from 'react'
import api from '../api'

interface LogEntry {
  id: number; level: string; source: string; message: string; created_at: string
}

const levelStyle = (level: string): React.CSSProperties => {
  if (level === 'error') return { color: 'var(--critical)', background: 'rgba(255,59,92,0.08)' }
  if (level === 'warn')  return { color: 'var(--warn)', background: 'rgba(255,179,0,0.06)' }
  if (level === 'info')  return { color: 'var(--accent)', background: 'transparent' }
  return { color: 'var(--text-faint)', background: 'transparent' }
}

const levelDot = (level: string) => {
  const colors: Record<string, string> = {
    error: 'var(--critical)', warn: 'var(--warn)', info: 'var(--accent)', debug: 'var(--text-faint)'
  }
  return <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: colors[level] || 'var(--text-faint)', flexShrink: 0, marginTop: 4 }} />
}

const inp: React.CSSProperties = {
  padding: '8px 12px', background: 'rgba(255,255,255,0.04)',
  border: '1px solid var(--border)', borderRadius: 8,
  color: 'var(--text-primary)', fontFamily: 'var(--font-body)',
  fontSize: 13, outline: 'none',
}

export default function Logs() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [total, setTotal] = useState(0)
  const [level, setLevel] = useState('')
  const [source, setSource] = useState('')
  const [search, setSearch] = useState('')
  const [live, setLive] = useState(false)
  const [page, setPage] = useState(1)
  const perPage = 100
  const wsRef = useRef<WebSocket | null>(null)

  const loadLogs = useCallback(() => {
    const p = new URLSearchParams()
    if (level) p.set('level', level)
    if (source) p.set('source', source)
    p.set('per_page', String(perPage))
    p.set('page', String(page))
    api.get(`/logs?${p}`).then(r => {
      const data: LogEntry[] = r.data.data || []
      const filtered = search ? data.filter(l => l.message.toLowerCase().includes(search.toLowerCase())) : data
      setLogs(filtered)
      setTotal(r.data.total || 0)
    })
  }, [level, source, page, search])

  useEffect(() => { if (!live) loadLogs() }, [loadLogs, live])
  useEffect(() => { setPage(1) }, [level, source, search])

  useEffect(() => {
    if (!live) { wsRef.current?.close(); wsRef.current = null; return }
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const token = localStorage.getItem('monmon_token')
    const ws = new WebSocket(`${proto}://${location.host}/api/ws/logs?token=${token}`)
    ws.onmessage = (e) => {
      try {
        const entry: LogEntry = JSON.parse(e.data)
        const matchLevel = !level || entry.level === level
        const matchSource = !source || entry.source.includes(source)
        const matchSearch = !search || entry.message.toLowerCase().includes(search.toLowerCase())
        if (matchLevel && matchSource && matchSearch) {
          setLogs(prev => [entry, ...prev.slice(0, 499)])
        }
      } catch { /* ignore */ }
    }
    wsRef.current = ws
    return () => { ws.close() }
  }, [live, level, source, search])

  const totalPages = Math.ceil(total / perPage)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Logs</h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {live ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--accent)' }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block', animation: 'pulse-green 1.5s ease-in-out infinite' }} />
                Live stream
              </span>
            ) : `${total.toLocaleString()} entries`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setLive(!live)} style={{
            padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600,
            fontFamily: 'var(--font-mono)', transition: 'all 0.15s',
            background: live ? 'var(--accent-dim)' : 'rgba(255,255,255,0.04)',
            color: live ? 'var(--accent)' : 'var(--text-muted)',
            border: live ? '1px solid var(--accent-glow)' : '1px solid var(--border)',
            boxShadow: live ? '0 0 12px var(--accent-glow)' : 'none',
          }}>
            {live ? '● LIVE' : 'LIVE'}
          </button>
          {!live && (
            <button onClick={loadLogs} style={{ ...inp, cursor: 'pointer', border: '1px solid var(--border)' }}>
              Refresh
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <select value={level} onChange={e => setLevel(e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
          <option value="">All levels</option>
          <option value="debug">Debug</option>
          <option value="info">Info</option>
          <option value="warn">Warn</option>
          <option value="error">Error</option>
        </select>
        <select value={source} onChange={e => setSource(e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
          <option value="">All sources</option>
          <option value="server">Server</option>
          <option value="scheduler">Scheduler</option>
          <option value="api">API</option>
        </select>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search messages..." style={{ ...inp, width: 220 }}
          onFocus={e => (e.target.style.borderColor = 'var(--accent-glow)')}
          onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
        {(level || source || search) && (
          <button onClick={() => { setLevel(''); setSource(''); setSearch('') }} style={{
            ...inp, cursor: 'pointer', color: 'var(--text-muted)',
          }}>✕ Clear</button>
        )}
      </div>

      {/* Log terminal */}
      <div style={{
        flex: 1, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12,
        overflow: 'auto', fontFamily: 'var(--font-mono)', fontSize: 12, minHeight: 0,
        boxShadow: 'inset 0 2px 20px rgba(0,0,0,0.3)',
      }}>
        {/* Terminal bar */}
        <div style={{
          padding: '10px 16px', borderBottom: '1px solid var(--border-subtle)',
          display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-card)',
          position: 'sticky', top: 0, zIndex: 1,
        }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#FF5F56' }} />
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#FFBD2E' }} />
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#27C93F' }} />
          <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-faint)' }}>monmon — log stream</span>
        </div>

        {logs.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-faint)' }}>
            No log entries
          </div>
        ) : (
          <div>
            {logs.map((l, i) => {
              const style = levelStyle(l.level)
              return (
                <div key={l.id || i} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  padding: '4px 14px', background: style.background,
                  borderBottom: '1px solid var(--border-subtle)',
                  transition: 'background 0.1s',
                }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-card-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.background = (style.background as string) || 'transparent')}>
                  {levelDot(l.level)}
                  <span style={{ color: 'var(--text-faint)', width: 72, flexShrink: 0, fontSize: 11 }}>
                    {new Date(l.created_at).toLocaleTimeString()}
                  </span>
                  <span style={{ ...style, background: 'none', width: 40, flexShrink: 0, fontWeight: 700, fontSize: 10, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                    {l.level}
                  </span>
                  <span style={{ color: 'var(--text-faint)', width: 90, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {l.source}
                  </span>
                  <span style={{ color: l.level === 'error' ? 'var(--critical)' : l.level === 'warn' ? 'var(--warn)' : 'var(--text-primary)', wordBreak: 'break-all' }}>
                    {l.message}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Pagination */}
      {!live && totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Page {page} of {totalPages}</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button disabled={page === 1} onClick={() => setPage(p => p - 1)} style={{ ...inp, cursor: page === 1 ? 'not-allowed' : 'pointer', opacity: page === 1 ? 0.3 : 1 }}>← Prev</button>
            <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)} style={{ ...inp, cursor: page === totalPages ? 'not-allowed' : 'pointer', opacity: page === totalPages ? 0.3 : 1 }}>Next →</button>
          </div>
        </div>
      )}
    </div>
  )
}
