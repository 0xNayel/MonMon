import { useEffect, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import api from '../api'

interface Stats {
  tasks: { total: number; active: number; paused: number; error: number }
  checks: { total: number; changes: number; changes_24h: number; errors_24h: number }
  recent_activity: { task_id: number; task_name: string; status: string; version: number; time: string; duration_ms: number; error_msg: string }[]
}

function AnimatedNumber({ value }: { value: number }) {
  const [display, setDisplay] = useState(0)
  const prev = useRef(0)

  useEffect(() => {
    const start = prev.current
    const end = value
    if (start === end) return
    const steps = 20
    const inc = (end - start) / steps
    let i = 0
    const t = setInterval(() => {
      i++
      setDisplay(Math.round(start + inc * i))
      if (i >= steps) { clearInterval(t); setDisplay(end); prev.current = end }
    }, 30)
    return () => clearInterval(t)
  }, [value])

  return <>{display.toLocaleString()}</>
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'success') return (
    <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
      <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
  if (status === 'changed') return (
    <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
      <path d="M4 4v5h5M20 20v-5h-5M4 9a9 9 0 0114.65-3.65L20 9M4 15l1.35 3.65A9 9 0 0020 15" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
  return (
    <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
      <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round"/>
    </svg>
  )
}

const statusStyle = (s: string): React.CSSProperties => {
  if (s === 'changed') return { background: 'rgba(255,179,0,0.12)', color: '#FFB300', border: '1px solid rgba(255,179,0,0.25)' }
  if (s === 'error') return { background: 'var(--critical-dim)', color: 'var(--critical)', border: '1px solid rgba(255,59,92,0.25)' }
  return { background: 'rgba(99,102,241,0.08)', color: 'var(--accent)', border: '1px solid rgba(99,102,241,0.18)' }
}

function SkeletonCard() {
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 22px' }}>
      <div className="skeleton" style={{ height: 11, width: '60%', marginBottom: 12 }} />
      <div className="skeleton" style={{ height: 28, width: '40%' }} />
    </div>
  )
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null)

  useEffect(() => {
    api.get('/stats').then(r => setStats(r.data)).catch(() => {})
  }, [])

  const cards = stats ? [
    { label: 'Total Tasks', value: stats.tasks.total, color: 'var(--text-primary)', accent: false },
    { label: 'Active', value: stats.tasks.active, color: 'var(--accent)', accent: true, pulse: stats.tasks.active > 0 },
    { label: 'Paused', value: stats.tasks.paused, color: '#FFB300', accent: false },
    { label: 'Changes 24h', value: stats.checks.changes_24h, color: '#FFB300', accent: false, warn: stats.checks.changes_24h > 0 },
    { label: 'Errors 24h', value: stats.checks.errors_24h, color: 'var(--critical)', accent: false, crit: stats.checks.errors_24h > 0 },
  ] : null

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
          Dashboard
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>System overview — real-time</p>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14, marginBottom: 32 }}>
        {cards ? cards.map((c, i) => (
          <div key={c.label} className="cascade" style={{
            animationDelay: `${i * 60}ms`,
            background: c.crit ? 'rgba(255,59,92,0.06)' : c.warn ? 'rgba(255,179,0,0.06)' : 'var(--bg-card)',
            backdropFilter: 'blur(12px)',
            border: c.crit ? '1px solid rgba(255,59,92,0.25)' : c.warn ? '1px solid rgba(255,179,0,0.2)' : '1px solid var(--border)',
            borderRadius: 12, padding: '20px 22px',
            transition: 'transform 0.2s ease-out, box-shadow 0.2s ease-out',
            cursor: 'default',
            animation: `cascade-in 0.4s ease-out ${i * 60}ms both`,
          }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.transform = 'translateY(-4px)'
              ;(e.currentTarget as HTMLElement).style.boxShadow = '0 12px 32px rgba(0,0,0,0.4)'
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'
              ;(e.currentTarget as HTMLElement).style.boxShadow = 'none'
            }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              {c.label}
            </div>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 28, fontWeight: 700, color: c.color,
              animation: c.pulse ? 'breathe 2s ease-in-out infinite' : undefined,
            }}>
              <AnimatedNumber value={c.value} />
            </div>
            {c.pulse && c.value > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                <div style={{
                  width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)',
                  animation: 'pulse-green 2s ease-in-out infinite',
                }} />
                <span style={{ fontSize: 11, color: 'var(--accent)' }}>monitoring</span>
              </div>
            )}
          </div>
        )) : Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)}
      </div>

      {/* Recent activity */}
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          Recent Activity
        </h3>
        <Link to="/tasks" style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none', opacity: 0.8 }}>
          View all tasks →
        </Link>
      </div>

      <div style={{ background: 'var(--bg-card)', backdropFilter: 'blur(12px)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        {!stats ? (
          <div style={{ padding: 20 }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
                <div className="skeleton" style={{ height: 14, width: '25%' }} />
                <div className="skeleton" style={{ height: 14, width: '12%' }} />
                <div className="skeleton" style={{ height: 14, width: '8%' }} />
                <div className="skeleton" style={{ height: 14, width: '20%' }} />
              </div>
            ))}
          </div>
        ) : stats.recent_activity?.length ? (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Task', 'Status', 'Version', 'Duration', 'Time'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '12px 16px', fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-body)', fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stats.recent_activity.map((a, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)', transition: 'background 0.1s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <td style={{ padding: '12px 16px' }}>
                    <Link to={`/tasks/${a.task_id}`} style={{ color: 'var(--text-primary)', textDecoration: 'none', fontWeight: 500, transition: 'color 0.1s' }}
                      onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent)')}
                      onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-primary)')}>
                      {a.task_name}
                    </Link>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 6, fontSize: 12, fontWeight: 500, ...statusStyle(a.status) }}>
                      <StatusIcon status={a.status} />
                      {a.status}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-muted)' }}>
                    #{a.version}
                  </td>
                  <td style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                    {a.error_msg?.startsWith('timeout')
                      ? <span style={{ color: 'var(--critical)', fontWeight: 600 }}>killed</span>
                      : <span style={{ color: a.duration_ms > 5000 ? 'var(--warn)' : 'var(--text-muted)' }}>
                          {a.duration_ms >= 1000 ? `${(a.duration_ms / 1000).toFixed(1)}s` : `${a.duration_ms}ms`}
                        </span>
                    }
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-muted)' }}>
                    {new Date(a.time).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
            No recent activity — start monitoring to see data here
          </div>
        )}
      </div>
    </div>
  )
}
