import { useEffect, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import api from '../api'
import { formatDuration } from '../utils'

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

const statusBadge = (s: string): React.CSSProperties => {
  if (s === 'changed') return { background: 'rgba(255,179,0,0.12)', color: '#FFB300', border: '1px solid rgba(255,179,0,0.25)' }
  if (s === 'error')   return { background: 'var(--critical-dim)', color: 'var(--critical)', border: '1px solid rgba(255,59,92,0.25)' }
  return { background: 'var(--success-dim)', color: 'var(--success)', border: '1px solid var(--success-glow)' }
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'success') return (
    <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
      <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
  if (status === 'changed') return (
    <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
      <path d="M4 4v5h5M20 20v-5h-5M4 9a9 9 0 0114.65-3.65L20 9M4 15l1.35 3.65A9 9 0 0020 15" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
  return (
    <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
      <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round"/>
    </svg>
  )
}

function SkeletonCard() {
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 22px', overflow: 'hidden', position: 'relative' }}>
      <div className="skeleton" style={{ height: 11, width: '55%', marginBottom: 14 }} />
      <div className="skeleton" style={{ height: 30, width: '35%' }} />
    </div>
  )
}

interface StatCard {
  label: string
  value: number
  color: string
  topColor: string
  icon: React.ReactNode
  sub?: React.ReactNode
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null)

  useEffect(() => {
    api.get('/stats').then(r => setStats(r.data)).catch(() => {})
  }, [])

  const cards: StatCard[] | null = stats ? [
    {
      label: 'Total Tasks', value: stats.tasks.total,
      color: 'var(--text-primary)', topColor: 'var(--border)',
      icon: (
        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
          <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
          <rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>
        </svg>
      ),
    },
    {
      label: 'Active', value: stats.tasks.active,
      color: 'var(--accent)', topColor: 'var(--accent-solid)',
      icon: (
        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
          <circle cx="12" cy="12" r="9"/><path d="M12 8v4l3 3" strokeLinecap="round"/>
        </svg>
      ),
      sub: stats.tasks.active > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', animation: 'pulse-accent 2s ease-in-out infinite' }} />
          <span style={{ fontSize: 11, color: 'var(--accent)' }}>monitoring</span>
        </div>
      ),
    },
    {
      label: 'Paused', value: stats.tasks.paused,
      color: '#FFB300', topColor: stats.tasks.paused > 0 ? '#FFB300' : 'var(--border)',
      icon: (
        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
          <rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>
        </svg>
      ),
    },
    {
      label: 'Changes 24h', value: stats.checks.changes_24h,
      color: stats.checks.changes_24h > 0 ? '#FFB300' : 'var(--text-muted)',
      topColor: stats.checks.changes_24h > 0 ? '#FFB300' : 'var(--border)',
      icon: (
        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
          <path d="M4 4v5h5M20 20v-5h-5M4 9a9 9 0 0114.65-3.65L20 9M4 15l1.35 3.65A9 9 0 0020 15" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ),
    },
    {
      label: 'Errors 24h', value: stats.checks.errors_24h,
      color: stats.checks.errors_24h > 0 ? 'var(--critical)' : 'var(--text-muted)',
      topColor: stats.checks.errors_24h > 0 ? 'var(--critical)' : 'var(--border)',
      icon: (
        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
          <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ),
    },
  ] : null

  return (
    <div>
      {/* Page header */}
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 5, letterSpacing: '0.02em' }}>
          Dashboard
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>System overview — real-time</p>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14, marginBottom: 32 }}>
        {cards ? cards.map((c, i) => (
          <div key={c.label} className="cascade" style={{
            animationDelay: `${i * 60}ms`,
            background: 'var(--bg-card)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: '18px 20px 20px',
            position: 'relative',
            overflow: 'hidden',
            transition: 'transform 0.2s ease, box-shadow 0.2s ease',
            cursor: 'default',
          }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.transform = 'translateY(-3px)'
              ;(e.currentTarget as HTMLElement).style.boxShadow = '0 8px 32px rgba(0,0,0,0.4)'
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'
              ;(e.currentTarget as HTMLElement).style.boxShadow = 'none'
            }}>
            {/* Colored top border */}
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0, height: 2,
              background: c.topColor,
              opacity: c.topColor === 'var(--border)' ? 1 : 0.7,
            }} />

            {/* Icon + label row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
              <span style={{ color: c.color, opacity: 0.7 }}>{c.icon}</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.07em', textTransform: 'uppercase', fontWeight: 600 }}>
                {c.label}
              </span>
            </div>

            {/* Value */}
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 30, fontWeight: 700, color: c.color, lineHeight: 1 }}>
              <AnimatedNumber value={c.value} />
            </div>

            {c.sub}
          </div>
        )) : Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)}
      </div>

      {/* Recent activity */}
      <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 className="section-header">Recent Activity</h3>
        <Link to="/tasks" style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none', opacity: 0.8, transition: 'opacity 0.15s' }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '0.8')}>
          View all tasks →
        </Link>
      </div>

      <div style={{ background: 'var(--bg-card)', backdropFilter: 'blur(16px)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
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
          <table className="data-table">
            <thead>
              <tr>
                {['Task', 'Status', 'Version', 'Duration', 'Time'].map(h => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stats.recent_activity.map((a, i) => (
                <tr key={i}>
                  <td>
                    <Link to={`/tasks/${a.task_id}`} style={{ color: 'var(--text-primary)', textDecoration: 'none', fontWeight: 500, transition: 'color 0.1s' }}
                      onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent)')}
                      onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-primary)')}>
                      {a.task_name}
                    </Link>
                  </td>
                  <td>
                    <span className="badge" style={{ ...statusBadge(a.status), borderRadius: 20 }}>
                      <StatusIcon status={a.status} />
                      {a.status}
                    </span>
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>
                    #{a.version}
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                    {a.error_msg?.startsWith('timeout')
                      ? <span style={{ color: 'var(--critical)', fontWeight: 600 }}>killed</span>
                      : <span style={{ color: a.duration_ms > 5000 ? 'var(--warn)' : 'var(--text-muted)' }}>
                          {formatDuration(a.duration_ms)}
                        </span>
                    }
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {new Date(a.time).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ padding: '48px', textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.3 }}>◎</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>No recent activity — start monitoring to see data here</div>
          </div>
        )}
      </div>
    </div>
  )
}
