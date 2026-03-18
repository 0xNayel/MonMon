import { useEffect, useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import api from '../api'
import { formatDuration, formatInterval, toSeconds } from '../utils'

interface Task {
  id: number; name: string; type: string; status: string; config: string
  schedule_type: string; schedule_value: string; total_checks: number; total_changes: number
  last_check_at: string | null; tags: string; data_retention: number
}

interface Check {
  id: number; version: number; status: string; diff_added: number; diff_removed: number
  duration_ms: number; created_at: string; error_msg: string
}

const statusStyle = (s: string): React.CSSProperties => {
  if (s === 'success') return { background: 'rgba(99,102,241,0.08)', color: 'var(--accent)', border: '1px solid rgba(99,102,241,0.2)' }
  if (s === 'changed') return { background: 'var(--warn-dim)', color: 'var(--warn)', border: '1px solid rgba(255,179,0,0.2)' }
  return { background: 'var(--critical-dim)', color: 'var(--critical)', border: '1px solid rgba(255,59,92,0.2)' }
}

const statusIcon = (s: string) => {
  if (s === 'success') return (
    <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
      <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
  if (s === 'changed') return (
    <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
      <path d="M4 4v5h5M20 20v-5h-5M4 9a9 9 0 0114.65-3.65L20 9M4 15l1.35 3.65A9 9 0 0020 15" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
  return (
    <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
      <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round"/>
    </svg>
  )
}

const inp: React.CSSProperties = {
  padding: '7px 12px', background: 'rgba(255,255,255,0.04)',
  border: '1px solid var(--border)', borderRadius: 8,
  color: 'var(--text-primary)', fontFamily: 'var(--font-body)',
  fontSize: 13, outline: 'none',
}

const formInp: React.CSSProperties = {
  padding: '8px 12px', background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8,
  color: 'var(--text-primary)', fontFamily: 'var(--font-body)',
  fontSize: 13, outline: 'none', width: '100%',
}

export default function TaskDetail() {
  const { id } = useParams()
  const [task, setTask] = useState<Task | null>(null)
  const [checks, setChecks] = useState<Check[]>([])
  const [total, setTotal] = useState(0)
  const [filterStatus, setFilterStatus] = useState('')
  const [sortOrder, setSortOrder] = useState('desc')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [configOpen, setConfigOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({ name: '', schedule_value: '1', schedule_type: 'loop', config: '' })
  const [editUnit, setEditUnit] = useState<'s' | 'm' | 'h'>('m')
  const perPage = 25

  const loadChecks = useCallback(() => {
    setLoading(true)
    const p = new URLSearchParams()
    if (filterStatus) p.set('status', filterStatus)
    p.set('order', sortOrder); p.set('page', String(page)); p.set('per_page', String(perPage))
    api.get(`/tasks/${id}/checks?${p}`).then(r => {
      setChecks(r.data.data || [])
      setTotal(r.data.total || 0)
    }).finally(() => setLoading(false))
  }, [id, filterStatus, sortOrder, page])

  const loadTask = useCallback(() => {
    api.get(`/tasks/${id}`).then(r => setTask(r.data))
  }, [id])

  useEffect(() => { loadTask() }, [loadTask])
  useEffect(() => { loadChecks() }, [loadChecks])
  useEffect(() => { setPage(1) }, [filterStatus, sortOrder])

  const runNow = async () => { await api.post(`/tasks/${id}/run`); setTimeout(loadChecks, 800) }

  const openEdit = () => {
    if (!task) return
    const secs = parseInt(task.schedule_value, 10)
    let val = String(secs), unit: 's' | 'm' | 'h' = 's'
    if (secs >= 3600 && secs % 3600 === 0) { val = String(secs / 3600); unit = 'h' }
    else if (secs >= 60 && secs % 60 === 0) { val = String(secs / 60); unit = 'm' }
    let prettyConf = task.config
    try { prettyConf = JSON.stringify(JSON.parse(task.config), null, 2) } catch { /* keep raw */ }
    setEditForm({ name: task.name, schedule_value: val, schedule_type: task.schedule_type, config: prettyConf })
    setEditUnit(unit)
    setEditing(true)
  }

  const saveEdit = async () => {
    const payload: Record<string, string> = {
      name: editForm.name,
      schedule_type: editForm.schedule_type,
      schedule_value: editForm.schedule_type === 'loop'
        ? String(toSeconds(editForm.schedule_value, editUnit))
        : editForm.schedule_value,
    }
    // Validate and compact the JSON config
    try {
      const parsed = JSON.parse(editForm.config)
      payload.config = JSON.stringify(parsed)
    } catch {
      alert('Invalid JSON in config')
      return
    }
    try {
      await api.put(`/tasks/${id}`, payload)
      setEditing(false)
      loadTask()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      alert('Error: ' + (msg || 'failed to update task'))
    }
  }

  const taskStatusStyle = (s: string): React.CSSProperties => {
    if (s === 'active') return { background: 'rgba(99,102,241,0.1)', color: 'var(--accent)', border: '1px solid rgba(99,102,241,0.25)', animation: 'breathe 2s ease-in-out infinite' }
    if (s === 'paused') return { background: 'var(--warn-dim)', color: 'var(--warn)', border: '1px solid rgba(255,179,0,0.25)' }
    return { background: 'var(--critical-dim)', color: 'var(--critical)', border: '1px solid rgba(255,59,92,0.25)' }
  }

  const totalPages = Math.ceil(total / perPage)

  let prettyConfig = task?.config || ''
  try { prettyConfig = JSON.stringify(JSON.parse(task?.config || ''), null, 2) } catch { /* keep raw */ }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Breadcrumb + header */}
      <div>
        <Link to="/tasks" style={{ fontSize: 12, color: 'var(--text-muted)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 12, transition: 'color 0.1s' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}>
          ← Tasks
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {task ? (
              <>
                <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700 }}>{task.name}</h2>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 6, fontSize: 12, fontWeight: 500, ...taskStatusStyle(task.status) }}>
                  {task.status}
                </span>
              </>
            ) : (
              <div className="skeleton" style={{ height: 26, width: 240 }} />
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={openEdit} style={{
              padding: '9px 18px', background: 'rgba(255,179,0,0.1)', color: '#FFB300',
              border: '1px solid rgba(255,179,0,0.25)', borderRadius: 8, cursor: 'pointer',
              fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, letterSpacing: '0.06em',
              transition: 'all 0.15s',
            }}>
              EDIT
            </button>
            <button onClick={runNow} style={{
              padding: '9px 20px', background: 'var(--accent-solid)', color: '#ffffff',
              border: 'none', borderRadius: 8, cursor: 'pointer',
              fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, letterSpacing: '0.06em',
              boxShadow: '0 0 16px rgba(99,102,241,0.25)', transition: 'all 0.15s',
            }}>
              ▶ RUN NOW
            </button>
          </div>
        </div>
      </div>

      {/* Edit panel */}
      {editing && (
        <div style={{
          background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(12px)',
          border: '1px solid rgba(255,179,0,0.2)', borderRadius: 12, padding: '24px',
          animation: 'cascade-in 0.25s ease-out',
        }}>
          <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: 'var(--warn)', marginBottom: 20, letterSpacing: '0.08em' }}>
            EDIT TASK
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Task Name</label>
              <input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                style={formInp}
                onFocus={e => (e.target.style.borderColor = 'rgba(255,179,0,0.4)')}
                onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.08)')} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                {editForm.schedule_type === 'loop' ? 'Interval' : 'Cron Expression'}
              </label>
              {editForm.schedule_type === 'loop' ? (
                <div style={{ display: 'flex', gap: 6 }}>
                  <input type="number" min="1" value={editForm.schedule_value}
                    onChange={e => setEditForm(f => ({ ...f, schedule_value: e.target.value }))}
                    style={{ ...formInp, flex: 1 }}
                    onFocus={e => (e.target.style.borderColor = 'rgba(255,179,0,0.4)')}
                    onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.08)')} />
                  <div style={{ display: 'flex', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, overflow: 'hidden' }}>
                    {(['s', 'm', 'h'] as const).map(u => (
                      <button key={u} type="button" onClick={() => setEditUnit(u)} style={{
                        padding: '0 14px', height: '100%', border: 'none', cursor: 'pointer',
                        fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600,
                        transition: 'all 0.15s',
                        background: editUnit === u ? 'var(--warn)' : 'transparent',
                        color: editUnit === u ? '#000' : 'var(--text-muted)',
                      }}>{u}</button>
                    ))}
                  </div>
                </div>
              ) : (
                <input value={editForm.schedule_value}
                  onChange={e => setEditForm(f => ({ ...f, schedule_value: e.target.value }))}
                  placeholder="*/5 * * * *" style={formInp}
                  onFocus={e => (e.target.style.borderColor = 'rgba(255,179,0,0.4)')}
                  onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.08)')} />
              )}
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Config (JSON)</label>
            <textarea value={editForm.config}
              onChange={e => setEditForm(f => ({ ...f, config: e.target.value }))}
              rows={8}
              style={{ ...formInp, resize: 'vertical', fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.6 }}
              onFocus={e => (e.target.style.borderColor = 'rgba(255,179,0,0.4)')}
              onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.08)')} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button onClick={() => setEditing(false)} style={{
              padding: '9px 18px', background: 'none', border: '1px solid var(--border)',
              borderRadius: 8, cursor: 'pointer', color: 'var(--text-muted)',
              fontFamily: 'var(--font-body)', fontSize: 13,
            }}>Cancel</button>
            <button onClick={saveEdit} style={{
              padding: '9px 22px', background: 'var(--warn)', color: '#000',
              border: 'none', borderRadius: 8, cursor: 'pointer',
              fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, letterSpacing: '0.06em',
              boxShadow: '0 0 16px rgba(255,179,0,0.25)',
            }}>SAVE</button>
          </div>
        </div>
      )}

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {task ? [
          { label: 'Type', value: task.type },
          { label: 'Schedule', value: task.schedule_type === 'loop' ? `every ${formatInterval(task.schedule_value)}` : task.schedule_value },
          { label: 'Total Checks', value: total.toLocaleString(), mono: true },
          { label: 'Total Changes', value: task.total_changes.toLocaleString(), highlight: task.total_changes > 0 },
        ].map((c, i) => (
          <div key={i} style={{ background: 'var(--bg-card)', backdropFilter: 'blur(12px)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 18px', animation: `cascade-in 0.4s ease-out ${i * 60}ms both` }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{c.label}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 600, color: c.highlight ? 'var(--warn)' : 'var(--text-primary)' }}>{c.value}</div>
          </div>
        )) : Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 18px' }}>
            <div className="skeleton" style={{ height: 11, width: '60%', marginBottom: 10 }} />
            <div className="skeleton" style={{ height: 18, width: '40%' }} />
          </div>
        ))}
      </div>

      {/* Config collapsible */}
      <div style={{ background: 'var(--bg-card)', backdropFilter: 'blur(12px)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        <button onClick={() => setConfigOpen(o => !o)} style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 18px', background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--text-muted)', fontFamily: 'var(--font-body)', fontSize: 13,
          transition: 'color 0.15s',
        }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}>
          <span style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600 }}>Configuration</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 16, transform: configOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>∨</span>
        </button>
        {configOpen && (
          <pre style={{
            margin: 0, padding: '0 18px 18px', fontSize: 12,
            fontFamily: 'var(--font-mono)', color: 'var(--text-muted)',
            whiteSpace: 'pre-wrap', borderTop: '1px solid var(--border)',
            paddingTop: 14, lineHeight: 1.6,
          }}>{prettyConfig}</pre>
        )}
      </div>

      {/* Check history */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            Check History <span style={{ color: 'var(--text-faint)' }}>({total})</span>
          </h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
              <option value="">All statuses</option>
              <option value="success">Success</option>
              <option value="changed">Changed</option>
              <option value="error">Error</option>
            </select>
            <button onClick={() => setSortOrder(o => o === 'desc' ? 'asc' : 'desc')} style={{ ...inp, cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
              {sortOrder === 'desc' ? '↓ Newest' : '↑ Oldest'}
            </button>
          </div>
        </div>

        <div style={{ background: 'var(--bg-card)', backdropFilter: 'blur(12px)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Version', 'Status', 'Changes', 'Duration', 'Time', 'Actions'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '12px 16px', fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  {Array.from({ length: 6 }).map((_, j) => (
                    <td key={j} style={{ padding: '12px 16px' }}>
                      <div className="skeleton" style={{ height: 13, width: j === 0 ? '30%' : j === 4 ? '70%' : '50%' }} />
                    </td>
                  ))}
                </tr>
              )) : checks.map(c => (
                <tr key={c.id} style={{ borderBottom: '1px solid var(--border-subtle)', transition: 'background 0.1s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.025)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <td style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-muted)' }}>#{c.version}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 6, fontSize: 12, fontWeight: 500, ...statusStyle(c.status) }}>
                      {statusIcon(c.status)}{c.status}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                    {c.diff_added > 0 && <span style={{ color: 'var(--accent)' }}>+{c.diff_added} </span>}
                    {c.diff_removed > 0 && <span style={{ color: 'var(--critical)' }}>-{c.diff_removed}</span>}
                    {c.diff_added === 0 && c.diff_removed === 0 && <span style={{ color: 'var(--text-faint)' }}>—</span>}
                  </td>
                  <td style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>{formatDuration(c.duration_ms)}</td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-muted)' }}>{new Date(c.created_at).toLocaleString()}</td>
                  <td style={{ padding: '12px 16px', display: 'flex', gap: 8, alignItems: 'center' }}>
                    {(c.diff_added > 0 || c.diff_removed > 0) && (
                      <Link to={`/checks/${c.id}/diff`} style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none', fontFamily: 'var(--font-mono)' }}>
                        View Diff →
                      </Link>
                    )}
                    {c.error_msg && (
                      <span style={{ fontSize: 12, color: 'var(--critical)', cursor: 'help' }} title={c.error_msg}>⚠ Error</span>
                    )}
                  </td>
                </tr>
              ))}
              {!loading && !checks.length && (
                <tr>
                  <td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
                    {filterStatus ? `No ${filterStatus} checks` : 'No checks yet — run the task to start monitoring'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Page {page} of {totalPages}</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button disabled={page === 1} onClick={() => setPage(p => p - 1)} style={{ ...inp, cursor: page === 1 ? 'not-allowed' : 'pointer', opacity: page === 1 ? 0.3 : 1 }}>← Prev</button>
              <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)} style={{ ...inp, cursor: page === totalPages ? 'not-allowed' : 'pointer', opacity: page === totalPages ? 0.3 : 1 }}>Next →</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
