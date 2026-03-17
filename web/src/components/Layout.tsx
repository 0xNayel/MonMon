import { NavLink, Outlet, useNavigate } from 'react-router-dom'

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

export default function Layout() {
  const navigate = useNavigate()
  const logout = () => { localStorage.removeItem('monmon_token'); navigate('/login') }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg-base)' }}>
      {/* Sidebar */}
      <aside style={{
        width: 220,
        background: 'rgba(255,255,255,0.02)',
        backdropFilter: 'blur(20px)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
      }}>
        {/* Brand */}
        <div style={{ padding: '24px 20px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            {/* Monster eye */}
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              background: 'radial-gradient(circle at 40% 40%, #818CF8, #312e81)',
              boxShadow: '0 0 16px rgba(99,102,241,0.5)',
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
        <nav style={{ flex: 1, padding: '12px 10px' }}>
          {nav.map(n => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'}
              style={({ isActive }) => ({
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 12px', borderRadius: 8, marginBottom: 2,
                textDecoration: 'none', fontSize: 14, fontWeight: 500,
                transition: 'all 0.15s',
                background: isActive ? 'var(--accent-dim)' : 'transparent',
                color: isActive ? 'var(--accent)' : 'var(--text-muted)',
                border: isActive ? '1px solid rgba(99,102,241,0.2)' : '1px solid transparent',
              })}>
              {n.icon}
              {n.label}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div style={{ padding: '12px 14px', borderTop: '1px solid var(--border)' }}>
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
      </aside>

      {/* Main */}
      <main style={{ flex: 1, overflowY: 'auto', padding: '28px 32px' }}>
        <Outlet />
      </main>
    </div>
  )
}
