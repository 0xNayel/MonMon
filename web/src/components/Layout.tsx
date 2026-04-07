import { useRef, useState, useEffect } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useTheme } from '../context/ThemeContext'
import { themes, type Theme } from '../themes'
import api from '../api'

const nav = [
  {
    to: '/', label: 'Dashboard',
    icon: (
      <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
        <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" />
      </svg>
    )
  },
  {
    to: '/tasks', label: 'Tasks',
    icon: (
      <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="12" r="9" /><path d="M12 8v4l3 3" strokeLinecap="round" />
      </svg>
    )
  },
  {
    to: '/alerts', label: 'Alerts',
    icon: (
      <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
        <path d="M15 17H20L18.595 15.595A1 1 0 0118 14.88V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.879a1 1 0 01-.293.707L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  },
  {
    to: '/logs', label: 'Logs',
    icon: (
      <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
        <path d="M4 6h16M4 10h16M4 14h10M4 18h6" strokeLinecap="round" />
      </svg>
    )
  },
  {
    to: '/system', label: 'System',
    icon: (
      <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="12" r="3" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2m-3.22-6.78-1.42 1.42M5.64 18.36l-1.42 1.42M18.36 18.36l-1.42-1.42M5.64 5.64 4.22 4.22" strokeLinecap="round" />
      </svg>
    )
  },
]

// ── Mini theme preview card ────────────────────────────────────────────────────
function ThemeCard({ t, active, onClick }: { t: Theme; active: boolean; onClick: (e: React.MouseEvent) => void }) {
  const [hovered, setHovered] = useState(false)

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: 'none', border: 'none', padding: 0, cursor: 'pointer',
        borderRadius: 12, outline: 'none',
        transform: hovered && !active ? 'translateY(-2px)' : 'none',
        transition: 'transform 0.2s',
      }}
    >
      <div style={{
        width: 136,
        borderRadius: 12,
        overflow: 'hidden',
        border: active
          ? `2px solid ${t.swatch.accent}`
          : hovered
            ? `2px solid ${t.swatch.accent}55`
            : '2px solid rgba(255,255,255,0.07)',
        boxShadow: active
          ? `0 0 0 3px ${t.swatch.accentDim}, 0 8px 24px rgba(0,0,0,0.4)`
          : hovered
            ? `0 4px 16px rgba(0,0,0,0.3)`
            : '0 2px 8px rgba(0,0,0,0.2)',
        transition: 'all 0.2s',
      }}>
        {/* Mini app preview */}
        <div style={{ height: 72, background: t.swatch.bg, display: 'flex', position: 'relative' }}>
          {/* Mini sidebar */}
          <div style={{
            width: 26, height: '100%', flexShrink: 0,
            background: t.swatch.surface,
            borderRight: `1px solid ${t.swatch.accent}22`,
            display: 'flex', flexDirection: 'column', gap: 4,
            padding: '8px 5px',
          }}>
            {/* Eye dot */}
            <div style={{ width: 12, height: 12, borderRadius: '50%', background: t.swatch.accent, opacity: 0.9, margin: '0 auto 4px' }} />
            {[1, 0.4, 0.4, 0.3].map((op, i) => (
              <div key={i} style={{ height: 3, borderRadius: 2, background: t.swatch.accent, opacity: op * 0.7 }} />
            ))}
          </div>
          {/* Mini main area */}
          <div style={{ flex: 1, padding: '8px 7px', display: 'flex', flexDirection: 'column', gap: 5 }}>
            {/* Accent header bar */}
            <div style={{ height: 5, borderRadius: 3, background: t.swatch.accent, width: '55%' }} />
            {/* Content lines */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {[80, 60, 70, 45].map((w, i) => (
                <div key={i} style={{
                  height: 3, borderRadius: 2,
                  background: i === 0 ? `${t.swatch.accent}55` : `${t.swatch.accent}18`,
                  width: `${w}%`,
                }} />
              ))}
            </div>
            {/* Mini card */}
            <div style={{
              marginTop: 2, borderRadius: 4, padding: '3px 5px',
              background: t.swatch.accentDim,
              borderLeft: `2px solid ${t.swatch.accent}`,
              width: '75%',
            }}>
              <div style={{ height: 3, borderRadius: 2, background: t.swatch.accent, width: '60%' }} />
            </div>
          </div>
          {/* Active checkmark */}
          {active && (
            <div style={{
              position: 'absolute', top: 6, right: 6,
              width: 18, height: 18, borderRadius: '50%',
              background: t.swatch.accent,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: `0 0 8px ${t.swatch.accentDim}`,
            }}>
              <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="#fff" strokeWidth="3">
                <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          )}
        </div>
        {/* Label */}
        <div style={{
          padding: '8px 10px',
          background: t.swatch.surface,
          borderTop: `1px solid ${t.swatch.accent}18`,
        }}>
          <div style={{
            fontSize: 11, fontWeight: 700, letterSpacing: '0.07em',
            fontFamily: 'var(--font-mono)',
            color: active ? t.swatch.accent : t.id === 'frost' ? '#0F172A' : '#E0E7FF',
          }}>{t.name}</div>
          <div style={{
            fontSize: 10, marginTop: 1,
            color: t.id === 'frost' ? '#64748B' : 'rgba(255,255,255,0.3)',
          }}>{t.tagline}</div>
        </div>
      </div>
    </button>
  )
}

// ── Theme Picker panel ─────────────────────────────────────────────────────────
function ThemePicker({ onClose, anchorRef }: {
  onClose: () => void
  anchorRef: React.RefObject<HTMLButtonElement | null>
}) {
  const { theme, setTheme } = useTheme()
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        anchorRef.current && !anchorRef.current.contains(e.target as Node)
      ) { onClose() }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose, anchorRef])

  const handleSelect = (id: string, e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const x = rect.left + rect.width / 2
    const y = rect.top + rect.height / 2
    setTheme(id, x, y)
    onClose()
  }

  return (
    <div ref={panelRef} style={{
      position: 'fixed',
      bottom: 56,
      left: 14,
      zIndex: 1000,
      background: 'var(--bg-surface)',
      border: '1px solid var(--border)',
      borderRadius: 16,
      padding: '18px 16px',
      backdropFilter: 'blur(24px)',
      WebkitBackdropFilter: 'blur(24px)',
      boxShadow: '0 -4px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04)',
      animation: 'picker-in 0.2s cubic-bezier(0.4,0,0.2,1)',
      transformOrigin: 'bottom left',
    }}>
      <style>{`
        @keyframes picker-in {
          from { opacity: 0; transform: scale(0.92) translateY(8px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
      <div style={{
        fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)',
        letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 14,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span>Theme</span>
        <span style={{ color: 'var(--accent)', fontSize: 10 }}>{theme.name}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 136px)', gap: 10 }}>
        {themes.map(t => (
          <ThemeCard
            key={t.id}
            t={t}
            active={theme.id === t.id}
            onClick={(e) => handleSelect(t.id, e)}
          />
        ))}
      </div>
    </div>
  )
}

// ── Layout ─────────────────────────────────────────────────────────────────────
export default function Layout() {
  const navigate = useNavigate()
  const { theme } = useTheme()
  const [pickerOpen, setPickerOpen] = useState(false)
  const paletteRef = useRef<HTMLButtonElement>(null)
  const [versionInfo, setVersionInfo] = useState<{ current: string; latest: string; update_available: boolean } | null>(null)

  useEffect(() => {
    api.get('/system/version').then(r => setVersionInfo(r.data)).catch(() => {})
  }, [])

  const logout = () => { localStorage.removeItem('monmon_token'); navigate('/login') }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg-base)' }}>
      {/* Sidebar */}
      <aside style={{
        width: 220,
        background: 'var(--bg-surface)',
        backdropFilter: 'blur(20px)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        position: 'relative',
        zIndex: 100,
        boxShadow: '4px 0 24px rgba(0,0,0,0.3)',
      }}>
        {/* Brand */}
        <div style={{ padding: '24px 20px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              background: theme.eyeGradient,
              boxShadow: `0 0 16px var(--accent-glow)`,
              animation: 'breathe 2s ease-in-out infinite',
              flexShrink: 0,
            }} />
            <div>
              <div style={{
                fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 16,
                color: 'var(--accent)', letterSpacing: '0.08em',
              }}>MONMON</div>
            </div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-body)', letterSpacing: '0.05em' }}>
            Always watching.
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '12px 8px' }}>
          {nav.map(n => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'}
              style={({ isActive }) => ({
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 14px', borderRadius: 8, marginBottom: 2,
                textDecoration: 'none', fontSize: 13, fontWeight: 500,
                transition: 'all 0.15s',
                background: isActive ? 'var(--accent-dim)' : 'transparent',
                color: isActive ? 'var(--accent)' : 'var(--text-muted)',
                borderLeft: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                paddingLeft: isActive ? '12px' : '14px',
              })}>
              {n.icon}
              {n.label}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div style={{ padding: '12px 14px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {/* Theme picker button */}
          <button
            ref={paletteRef}
            onClick={() => setPickerOpen(v => !v)}
            style={{
              width: '100%', textAlign: 'left', cursor: 'pointer',
              fontSize: 12, fontFamily: 'var(--font-body)', padding: '6px 0',
              display: 'flex', alignItems: 'center', gap: 8,
              transition: 'color 0.15s', background: 'none', border: 'none',
              color: pickerOpen ? 'var(--accent)' : 'var(--text-muted)',
            }}
            onMouseEnter={e => { if (!pickerOpen) e.currentTarget.style.color = 'var(--text-primary)' }}
            onMouseLeave={e => { if (!pickerOpen) e.currentTarget.style.color = 'var(--text-muted)' }}
          >
            {/* Palette icon */}
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
              <path d="M12 2C6.48 2 2 6.48 2 12c0 5.52 4.48 10 10 10 1.1 0 2-.9 2-2v-.5c0-.55.45-1 1-1h1c3.31 0 6-2.69 6-6C22 6.48 17.52 2 12 2z" strokeLinecap="round"/>
              <circle cx="7.5" cy="13.5" r="1" fill="currentColor" stroke="none"/>
              <circle cx="9.5" cy="9.5" r="1" fill="currentColor" stroke="none"/>
              <circle cx="14.5" cy="9.5" r="1" fill="currentColor" stroke="none"/>
              <circle cx="16.5" cy="13.5" r="1" fill="currentColor" stroke="none"/>
            </svg>
            <span style={{ flex: 1 }}>Theme</span>
            {/* Active theme swatch dot */}
            <span style={{
              width: 10, height: 10, borderRadius: '50%',
              background: theme.swatch.accent,
              boxShadow: `0 0 6px ${theme.swatch.accentDim}`,
              flexShrink: 0,
            }} />
          </button>

          {/* Version */}
          {versionInfo && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '4px 0', fontSize: 11, fontFamily: 'var(--font-mono)',
            }}>
              <span style={{ color: 'var(--text-faint)' }}>v{versionInfo.current}</span>
              {versionInfo.update_available && (
                <a
                  href={`https://github.com/0xNayel/MonMon/releases`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontSize: 10, fontWeight: 600, padding: '2px 7px',
                    borderRadius: 4, textDecoration: 'none',
                    background: 'rgba(99,102,241,0.12)', color: 'var(--accent)',
                    border: '1px solid rgba(99,102,241,0.25)',
                    animation: 'breathe 2s ease-in-out infinite',
                  }}
                >
                  v{versionInfo.latest} available
                </a>
              )}
            </div>
          )}

          {/* Sign out */}
          <button onClick={logout} style={{
            width: '100%', textAlign: 'left', background: 'none', border: 'none',
            cursor: 'pointer', fontSize: 12, color: 'var(--text-muted)',
            fontFamily: 'var(--font-body)', padding: '6px 0',
            transition: 'color 0.15s',
            display: 'flex', alignItems: 'center', gap: 8,
          }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}>
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
              <path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Sign out
          </button>
        </div>

        {/* Theme picker panel */}
        {pickerOpen && (
          <ThemePicker
            onClose={() => setPickerOpen(false)}
            anchorRef={paletteRef}
          />
        )}
      </aside>

      {/* Main */}
      <main style={{ flex: 1, overflowY: 'auto', padding: '28px 32px' }}>
        <Outlet />
      </main>
    </div>
  )
}
