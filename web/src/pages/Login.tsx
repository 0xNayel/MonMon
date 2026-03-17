import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api'

export default function Login() {
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
    width: '100%', padding: '11px 14px',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid var(--border)',
    borderRadius: 8, color: 'var(--text-primary)',
    fontFamily: 'var(--font-body)', fontSize: 14,
    outline: 'none', transition: 'border-color 0.15s',
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-base)', position: 'relative', overflow: 'hidden',
    }}>
      {/* Background glow */}
      <div style={{
        position: 'absolute', width: 600, height: 600, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(99,102,241,0.05) 0%, transparent 70%)',
        top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        pointerEvents: 'none',
      }} />

      <form onSubmit={submit} className="cascade" style={{
        width: 360, padding: '40px 36px',
        background: 'rgba(255,255,255,0.04)',
        backdropFilter: 'blur(24px)',
        border: '1px solid var(--border)',
        borderRadius: 16,
        boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
        position: 'relative',
      }}>
        {/* Eye + brand */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 52, height: 52, borderRadius: '50%', margin: '0 auto 16px',
            background: 'radial-gradient(circle at 38% 38%, #818CF8, #1e1b4b)',
            boxShadow: '0 0 32px rgba(99,102,241,0.4)',
            animation: 'breathe 2s ease-in-out infinite',
          }} />
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 700,
            color: 'var(--accent)', letterSpacing: '0.1em',
          }}>MONMON</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
            Monitoring Monster — Sign in
          </div>
        </div>

        {error && (
          <div style={{
            padding: '10px 14px', borderRadius: 8, marginBottom: 16,
            background: 'var(--critical-dim)', border: '1px solid rgba(255,59,92,0.3)',
            color: 'var(--critical)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01" strokeLinecap="round"/>
            </svg>
            {error}
          </div>
        )}

        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Username</label>
          <input value={username} onChange={e => setUsername(e.target.value)}
            placeholder="admin" autoFocus style={inp}
            onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
            onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
        </div>

        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Password</label>
          <input value={password} onChange={e => setPassword(e.target.value)}
            type="password" placeholder="••••••••" style={inp}
            onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
            onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
        </div>

        <button type="submit" disabled={loading} style={{
          width: '100%', padding: '12px',
          background: loading ? 'rgba(99,102,241,0.15)' : 'var(--accent-solid)',
          color: loading ? 'var(--accent)' : '#ffffff',
          border: 'none', borderRadius: 8, cursor: loading ? 'not-allowed' : 'pointer',
          fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700,
          letterSpacing: '0.08em', transition: 'all 0.15s',
          boxShadow: loading ? 'none' : '0 0 20px rgba(99,102,241,0.3)',
        }}>
          {loading ? 'AUTHENTICATING...' : 'ENTER SYSTEM'}
        </button>
      </form>
    </div>
  )
}
