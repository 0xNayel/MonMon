import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api'
import { useTheme } from '../context/ThemeContext'

export default function Login() {
  const { theme } = useTheme()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { data } = await api.post('/login', { username, password })
      localStorage.setItem('monmon_token', data.token)
      navigate('/')
    } catch {
      setError('Invalid credentials')
    } finally {
      setLoading(false)
    }
  }

  const inp: React.CSSProperties = {
    width: '100%', padding: '12px 14px',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid var(--border)',
    borderRadius: 8, color: 'var(--text-primary)',
    fontFamily: 'var(--font-body)', fontSize: 14,
    outline: 'none', transition: 'border-color 0.15s, box-shadow 0.15s',
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-base)', position: 'relative', overflow: 'hidden',
    }}>
      {/* Ambient glow orbs */}
      <div style={{
        position: 'absolute', width: 500, height: 500, borderRadius: '50%',
        background: `radial-gradient(circle, var(--accent-dim) 0%, transparent 70%)`,
        top: '-10%', left: '-5%', pointerEvents: 'none', opacity: 0.8,
      }} />
      <div style={{
        position: 'absolute', width: 400, height: 400, borderRadius: '50%',
        background: `radial-gradient(circle, var(--accent-dim) 0%, transparent 70%)`,
        bottom: '-10%', right: '0%', pointerEvents: 'none', opacity: 0.6,
      }} />
      <div style={{
        position: 'absolute', width: 300, height: 300, borderRadius: '50%',
        background: `radial-gradient(circle, var(--accent-glow) 0%, transparent 70%)`,
        top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        pointerEvents: 'none', opacity: 0.15,
      }} />

      <form onSubmit={submit} className="cascade" style={{
        width: 380, padding: '44px 40px 40px',
        background: 'rgba(255,255,255,0.04)',
        backdropFilter: 'blur(32px)',
        WebkitBackdropFilter: 'blur(32px)',
        border: '1px solid var(--border)',
        borderRadius: 18,
        boxShadow: '0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Top accent border */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 2,
          background: `linear-gradient(90deg, transparent, var(--accent-solid), var(--accent), transparent)`,
        }} />

        {/* Eye + brand */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%', margin: '0 auto 18px',
            background: theme.eyeGradient,
            boxShadow: `0 0 0 6px var(--accent-dim), 0 0 40px var(--accent-glow)`,
            animation: 'glow-breathe 3s ease-in-out infinite',
          }} />
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 24, fontWeight: 700,
            color: 'var(--accent)', letterSpacing: '0.12em',
            textShadow: `0 0 20px var(--accent-glow)`,
          }}>MONMON</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6, letterSpacing: '0.04em' }}>
            Monitoring Monster — Sign in to continue
          </div>
        </div>

        {error && (
          <div style={{
            padding: '10px 14px', borderRadius: 8, marginBottom: 18,
            background: 'var(--critical-dim)', border: '1px solid rgba(255,59,92,0.3)',
            color: 'var(--critical)', fontSize: 13,
            display: 'flex', alignItems: 'center', gap: 8,
            animation: 'cascade-in 0.2s ease-out',
          }}>
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01" strokeLinecap="round"/>
            </svg>
            {error}
          </div>
        )}

        <div style={{ marginBottom: 14 }}>
          <label style={{
            display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 7,
            letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600,
          }}>Username</label>
          <input value={username} onChange={e => setUsername(e.target.value)}
            placeholder="admin" autoFocus style={inp}
            onFocus={e => { e.target.style.borderColor = 'var(--accent)'; e.target.style.boxShadow = `0 0 0 3px var(--accent-dim)` }}
            onBlur={e => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none' }} />
        </div>

        <div style={{ marginBottom: 28 }}>
          <label style={{
            display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 7,
            letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600,
          }}>Password</label>
          <input value={password} onChange={e => setPassword(e.target.value)}
            type="password" placeholder="••••••••" style={inp}
            onFocus={e => { e.target.style.borderColor = 'var(--accent)'; e.target.style.boxShadow = `0 0 0 3px var(--accent-dim)` }}
            onBlur={e => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none' }} />
        </div>

        <button type="submit" disabled={loading} style={{
          width: '100%', padding: '13px',
          background: loading
            ? 'var(--accent-dim)'
            : `linear-gradient(135deg, var(--accent-solid), var(--accent))`,
          color: loading ? 'var(--accent)' : '#ffffff',
          border: 'none', borderRadius: 9, cursor: loading ? 'not-allowed' : 'pointer',
          fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700,
          letterSpacing: '0.1em', transition: 'all 0.2s',
          boxShadow: loading ? 'none' : `0 4px 20px var(--accent-glow), 0 0 0 1px rgba(255,255,255,0.08) inset`,
          transform: 'translateY(0)',
        }}
          onMouseEnter={e => { if (!loading) { (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'; (e.currentTarget as HTMLElement).style.boxShadow = `0 8px 28px var(--accent-glow)` } }}
          onMouseLeave={e => { if (!loading) { (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'; (e.currentTarget as HTMLElement).style.boxShadow = `0 4px 20px var(--accent-glow), 0 0 0 1px rgba(255,255,255,0.08) inset` } }}
        >
          {loading ? 'AUTHENTICATING...' : 'ENTER SYSTEM'}
        </button>
      </form>
    </div>
  )
}
