import { useEffect, useState } from 'react'
import api from '../api'

interface ToolStatus {
  name: string
  found: boolean
  path: string
  required_by: string[]
}

interface ToolsReport {
  tools: ToolStatus[]
  all_ok: boolean
}

export default function System() {
  const [report,  setReport]  = useState<ToolsReport | null>(null)
  const [loading, setLoading] = useState(false)

  const runCheck = () => {
    setLoading(true)
    api.get('/system/tools')
      .then(r => setReport(r.data))
      .finally(() => setLoading(false))
  }

  useEffect(() => { runCheck() }, [])

  const BTN: React.CSSProperties = {
    padding: '8px 18px', borderRadius: 8, cursor: 'pointer', outline: 'none',
    fontFamily: 'var(--font-mono)', fontSize: 12, border: '1px solid var(--border)',
    background: 'rgba(255,255,255,0.06)', color: 'var(--text-primary)', transition: 'all 0.15s',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700 }}>System</h2>
        <button
          onClick={runCheck}
          disabled={loading}
          style={{ ...BTN, opacity: loading ? 0.5 : 1 }}
        >
          {loading ? 'Checking...' : 'Re-check tools'}
        </button>
      </div>

      {/* External Tools Card */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>

        {/* Card header */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
            External Tools
          </h3>
          {report && (
            <span style={{
              padding: '2px 8px', borderRadius: 4, fontSize: 11, fontFamily: 'var(--font-mono)',
              background: report.all_ok ? 'var(--success-dim)' : 'var(--critical-dim)',
              color:      report.all_ok ? 'var(--success)'     : 'var(--critical)',
              border:     `1px solid ${report.all_ok ? 'var(--success-glow)' : 'var(--critical-dim)'}`,
            }}>
              {report.all_ok ? 'all found' : 'some missing'}
            </span>
          )}
          <span style={{ fontSize: 12, color: 'var(--text-faint)', fontFamily: 'var(--font-body)', marginLeft: 'auto' }}>
            Run <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11, background: 'rgba(255,255,255,0.06)', padding: '1px 6px', borderRadius: 4 }}>./check-tools.sh</code> for the CLI equivalent
          </span>
        </div>

        {/* Table */}
        {loading && !report ? (
          <div style={{ padding: '16px 20px' }}>
            {[...Array(3)].map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 44, marginBottom: 8, borderRadius: 8 }} />
            ))}
          </div>
        ) : report ? (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                {['Tool', 'Status', 'Path', 'Used By'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 20px', fontSize: 11, color: 'var(--text-faint)', fontWeight: 500, fontFamily: 'var(--font-body)', userSelect: 'none' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.tools.map(t => (
                <tr key={t.name} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <td style={{ padding: '14px 20px', fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-primary)', fontWeight: 600 }}>
                    {t.name}
                  </td>
                  <td style={{ padding: '14px 20px' }}>
                    <span style={{
                      padding: '3px 10px', borderRadius: 6, fontSize: 12, fontFamily: 'var(--font-mono)',
                      background: t.found ? 'var(--success-dim)' : 'var(--critical-dim)',
                      color:      t.found ? 'var(--success)'     : 'var(--critical)',
                      border:     `1px solid ${t.found ? 'var(--success-glow)' : 'var(--critical-dim)'}`,
                    }}>
                      {t.found ? 'found' : 'missing'}
                    </span>
                  </td>
                  <td style={{ padding: '14px 20px', fontFamily: 'var(--font-mono)', fontSize: 12, color: t.found ? 'var(--text-muted)' : 'var(--text-faint)' }}>
                    {t.path || '—'}
                  </td>
                  <td style={{ padding: '14px 20px' }}>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {t.required_by.map(rb => (
                        <span key={rb} style={{ padding: '2px 8px', background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)', borderRadius: 4, fontSize: 11, fontFamily: 'var(--font-mono)' }}>
                          {rb}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>
    </div>
  )
}
