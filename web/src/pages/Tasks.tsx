import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import api from '../api'
import ConfigForm from '../components/ConfigForm'
import { formatInterval, toSeconds } from '../utils'

interface Task {
  id: number; name: string; type: string; status: string
  schedule_type: string; schedule_value: string
  total_checks: number; total_changes: number; last_check_at: string | null
}

const statusStyle = (s: string): React.CSSProperties => {
  if (s === 'active') return { background: 'rgba(99,102,241,0.1)', color: 'var(--accent)', border: '1px solid rgba(99,102,241,0.2)' }
  if (s === 'paused') return { background: 'var(--warn-dim)', color: 'var(--warn)', border: '1px solid rgba(255,179,0,0.2)' }
  return { background: 'var(--critical-dim)', color: 'var(--critical)', border: '1px solid rgba(255,59,92,0.2)' }
}

const statusIcon = (s: string) => {
  if (s === 'active') return (
    <svg width="10" height="10" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="currentColor"/></svg>
  )
  if (s === 'paused') return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><rect x="2" y="1" width="2.5" height="8" rx="1"/><rect x="5.5" y="1" width="2.5" height="8" rx="1"/></svg>
  )
  return (
    <svg width="10" height="10" fill="none" viewBox="0 0 10 10" stroke="currentColor" strokeWidth="2">
      <path d="M2 2l6 6M8 2l-6 6" strokeLinecap="round"/>
    </svg>
  )
}

const typeStyle = (t: string): React.CSSProperties => {
  if (t === 'endpoint') return { background: 'rgba(56,189,248,0.1)', color: '#38BDF8', border: '1px solid rgba(56,189,248,0.2)' }
  if (t === 'command') return { background: 'rgba(167,139,250,0.1)', color: '#A78BFA', border: '1px solid rgba(167,139,250,0.2)' }
  return { background: 'rgba(251,146,60,0.1)', color: '#FB923C', border: '1px solid rgba(251,146,60,0.2)' }
}

const inp: React.CSSProperties = {
  padding: '8px 12px', background: 'rgba(255,255,255,0.04)',
  border: '1px solid var(--border)', borderRadius: 8,
  color: 'var(--text-primary)', fontFamily: 'var(--font-body)',
  fontSize: 13, outline: 'none',
}

function Badge({ style, children }: { style: React.CSSProperties; children: React.ReactNode }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 6, fontSize: 12, fontWeight: 500, ...style }}>
      {children}
    </span>
  )
}

export default function Tasks() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [total, setTotal] = useState(0)
  const [showAdd, setShowAdd] = useState(false)
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [sortField, setSortField] = useState('created_at')
  const [sortOrder, setSortOrder] = useState('desc')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const perPage = 20

  const [form, setForm] = useState({ name: '', type: 'endpoint', schedule_type: 'loop', schedule_value: '1' })
  const [scheduleUnit, setScheduleUnit] = useState<'s' | 'm' | 'h'>('m')
  const [configJson, setConfigJson] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    const p = new URLSearchParams()
    if (search) p.set('search', search)
    if (filterType) p.set('type', filterType)
    if (filterStatus) p.set('status', filterStatus)
    p.set('sort', sortField); p.set('order', sortOrder)
    p.set('page', String(page)); p.set('per_page', String(perPage))
    api.get(`/tasks?${p}`).then(r => {
      setTasks(r.data.data || [])
      setTotal(r.data.total || 0)
    }).finally(() => setLoading(false))
  }, [search, filterType, filterStatus, sortField, sortOrder, page])

  useEffect(() => { load() }, [load])
  useEffect(() => { setPage(1) }, [search, filterType, filterStatus, sortField, sortOrder])

  const addTask = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const payload = {
        ...form,
        config: configJson,
        schedule_value: form.schedule_type === 'loop'
          ? String(toSeconds(form.schedule_value, scheduleUnit))
          : form.schedule_value,
      }
      await api.post('/tasks', payload)
      setShowAdd(false)
      setForm({ name: '', type: 'endpoint', schedule_type: 'loop', schedule_value: '1' })
      setScheduleUnit('m')
      setConfigJson('')
      load()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      alert('Error: ' + (msg || 'failed to create task'))
    }
  }

  const action = async (id: number, act: string) => { await api.post(`/tasks/${id}/${act}`); load() }
  const del = async (id: number) => {
    if (!confirm('Delete task and all its checks?')) return
    await api.delete(`/tasks/${id}`); load()
  }

  const toggleSort = (field: string) => {
    if (sortField === field) setSortOrder(o => o === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortOrder('asc') }
  }

  const SortBtn = ({ field, label }: { field: string; label: string }) => (
    <button onClick={() => toggleSort(field)} style={{
      background: 'none', border: 'none', cursor: 'pointer', padding: 0,
      color: sortField === field ? 'var(--text-primary)' : 'var(--text-muted)',
      fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
      letterSpacing: '0.06em', textTransform: 'uppercase',
      display: 'flex', alignItems: 'center', gap: 4,
    }}>
      {label}
      {sortField === field && <span style={{ color: 'var(--accent)', fontSize: 13 }}>{sortOrder === 'asc' ? '↑' : '↓'}</span>}
    </button>
  )

  const totalPages = Math.ceil(total / perPage)
  const selectStyle = { ...inp, cursor: 'pointer' as const }
  const formInp: React.CSSProperties = {
    ...inp, width: '100%',
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.08)',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Tasks</h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>{total} task{total !== 1 ? 's' : ''} configured</p>
        </div>
        <button onClick={() => setShowAdd(!showAdd)} style={{
          padding: '9px 18px', background: showAdd ? 'rgba(99,102,241,0.15)' : 'var(--accent-solid)',
          color: showAdd ? 'var(--accent)' : '#ffffff',
          border: showAdd ? '1px solid rgba(99,102,241,0.3)' : 'none',
          borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font-mono)',
          fontSize: 13, fontWeight: 700, letterSpacing: '0.06em',
          transition: 'all 0.15s',
          boxShadow: showAdd ? 'none' : '0 0 16px rgba(99,102,241,0.25)',
        }}>
          {showAdd ? '✕ CANCEL' : '+ NEW TASK'}
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <form onSubmit={addTask} style={{
          background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(12px)',
          border: '1px solid rgba(99,102,241,0.15)', borderRadius: 12, padding: '24px',
          animation: 'cascade-in 0.25s ease-out',
        }}>
          <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: 'var(--accent)', marginBottom: 20, letterSpacing: '0.08em' }}>
            NEW TASK CONFIGURATION
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Task Name</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Monitor Login Page" style={formInp} required
                onFocus={e => (e.target.style.borderColor = 'rgba(99,102,241,0.4)')}
                onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.08)')} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Type</label>
              <select value={form.type} onChange={e => { setForm({ ...form, type: e.target.value }); setConfigJson('') }}
                style={{ ...formInp, cursor: 'pointer' }}>
                <option value="endpoint">Endpoint — HTTP URLs</option>
                <option value="command">Command — shell output</option>
                <option value="subdomain">Subdomain — discovery</option>
                <option value="bbscope">Bbscope — bug bounty scope</option>
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Schedule Type</label>
              <select value={form.schedule_type} onChange={e => setForm({ ...form, schedule_type: e.target.value })}
                style={{ ...formInp, cursor: 'pointer' }}>
                <option value="loop">Loop — every N seconds</option>
                <option value="cron">Cron expression</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                {form.schedule_type === 'loop' ? 'Interval' : 'Cron Expression'}
              </label>
              {form.schedule_type === 'loop' ? (
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    type="number" min="1" value={form.schedule_value}
                    onChange={e => setForm({ ...form, schedule_value: e.target.value })}
                    style={{ ...formInp, flex: 1 }} required
                    onFocus={e => (e.target.style.borderColor = 'rgba(99,102,241,0.4)')}
                    onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.08)')}
                  />
                  <div style={{ display: 'flex', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, overflow: 'hidden' }}>
                    {(['s', 'm', 'h'] as const).map(u => (
                      <button key={u} type="button" onClick={() => setScheduleUnit(u)} style={{
                        padding: '0 14px', height: '100%', border: 'none', cursor: 'pointer',
                        fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600,
                        transition: 'all 0.15s',
                        background: scheduleUnit === u ? 'var(--accent-solid)' : 'transparent',
                        color: scheduleUnit === u ? '#fff' : 'var(--text-muted)',
                      }}>{u}</button>
                    ))}
                  </div>
                </div>
              ) : (
                <input value={form.schedule_value} onChange={e => setForm({ ...form, schedule_value: e.target.value })}
                  placeholder="*/5 * * * *" style={formInp} required
                  onFocus={e => (e.target.style.borderColor = 'rgba(99,102,241,0.4)')}
                  onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.08)')} />
              )}
            </div>
          </div>
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16, marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 12, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              {form.type === 'endpoint' ? 'Endpoint Config' : form.type === 'command' ? 'Command Config' : 'Subdomain Config'}
            </label>
            <ConfigForm type={form.type} value={configJson} onChange={setConfigJson} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" onClick={() => setShowAdd(false)} style={{
              padding: '9px 18px', background: 'none', border: '1px solid var(--border)',
              borderRadius: 8, cursor: 'pointer', color: 'var(--text-muted)',
              fontFamily: 'var(--font-body)', fontSize: 13, transition: 'all 0.15s',
            }}>Cancel</button>
            <button type="submit" style={{
              padding: '9px 22px', background: 'var(--accent-solid)', color: '#ffffff',
              border: 'none', borderRadius: 8, cursor: 'pointer',
              fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, letterSpacing: '0.06em',
              boxShadow: '0 0 16px rgba(99,102,241,0.25)',
            }}>CREATE</button>
          </div>
        </form>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search tasks..." style={{ ...inp, width: 220 }}
          onFocus={e => (e.target.style.borderColor = 'rgba(99,102,241,0.4)')}
          onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
        <select value={filterType} onChange={e => setFilterType(e.target.value)} style={selectStyle}>
          <option value="">All types</option>
          <option value="endpoint">Endpoint</option>
          <option value="command">Command</option>
          <option value="subdomain">Subdomain</option>
          <option value="bbscope">Bbscope</option>
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={selectStyle}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="error">Error</option>
        </select>
        {(search || filterType || filterStatus) && (
          <button onClick={() => { setSearch(''); setFilterType(''); setFilterStatus('') }} style={{
            ...inp, cursor: 'pointer', color: 'var(--text-muted)', transition: 'color 0.15s',
          }}>✕ Clear</button>
        )}
      </div>

      {/* Table */}
      <div style={{ background: 'var(--bg-card)', backdropFilter: 'blur(12px)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th style={{ textAlign: 'left', padding: '12px 16px', width: 40 }}>
                <span style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>#</span>
              </th>
              {[
                { field: 'name', label: 'Name' },
                { field: null, label: 'Type' },
                { field: 'status', label: 'Status' },
                { field: null, label: 'Schedule' },
                { field: 'total_checks', label: 'Checks' },
                { field: 'total_changes', label: 'Changes' },
                { field: 'last_check_at', label: 'Last Check' },
                { field: null, label: 'Actions' },
              ].map(col => (
                <th key={col.label} style={{ textAlign: 'left', padding: '12px 16px' }}>
                  {col.field ? <SortBtn field={col.field} label={col.label} /> : (
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{col.label}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? Array.from({ length: 5 }).map((_, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                {Array.from({ length: 9 }).map((_, j) => (
                  <td key={j} style={{ padding: '14px 16px' }}>
                    <div className="skeleton" style={{ height: 13, width: j === 1 ? '70%' : '45%' }} />
                  </td>
                ))}
              </tr>
            )) : tasks.map(t => (
              <tr key={t.id} style={{ borderBottom: '1px solid var(--border-subtle)', transition: 'background 0.1s' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.025)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <td style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-faint)' }}>{t.id}</td>
                <td style={{ padding: '12px 16px', fontWeight: 500 }}>
                  <Link to={`/tasks/${t.id}`} style={{ color: 'var(--text-primary)', textDecoration: 'none', transition: 'color 0.1s' }}
                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent)')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-primary)')}>
                    {t.name}
                  </Link>
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <Badge style={typeStyle(t.type)}>{t.type}</Badge>
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <Badge style={statusStyle(t.status)}>
                    {statusIcon(t.status)}
                    {t.status}
                  </Badge>
                </td>
                <td style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>
                  {t.schedule_type === 'loop' ? formatInterval(t.schedule_value) : t.schedule_value}
                </td>
                <td style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-primary)' }}>
                  {t.total_checks.toLocaleString()}
                </td>
                <td style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)', fontSize: 13, color: t.total_changes > 0 ? '#FFB300' : 'var(--text-muted)' }}>
                  {t.total_changes > 0 ? `+${t.total_changes}` : '—'}
                </td>
                <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-muted)' }}>
                  {t.last_check_at ? new Date(t.last_check_at).toLocaleString() : '—'}
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {t.status === 'active'
                      ? <button onClick={() => action(t.id, 'pause')} style={{ padding: '4px 10px', background: 'var(--warn-dim)', color: 'var(--warn)', border: '1px solid rgba(255,179,0,0.2)', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontFamily: 'var(--font-body)' }}>Pause</button>
                      : <button onClick={() => action(t.id, 'resume')} style={{ padding: '4px 10px', background: 'rgba(99,102,241,0.08)', color: 'var(--accent)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontFamily: 'var(--font-body)' }}>Resume</button>
                    }
                    <button onClick={() => action(t.id, 'run')} style={{ padding: '4px 10px', background: 'rgba(56,189,248,0.08)', color: '#38BDF8', border: '1px solid rgba(56,189,248,0.2)', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontFamily: 'var(--font-body)' }}>▶ Run</button>
                    <button onClick={() => del(t.id)} style={{ padding: '4px 10px', background: 'var(--critical-dim)', color: 'var(--critical)', border: '1px solid rgba(255,59,92,0.2)', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontFamily: 'var(--font-body)' }}>Del</button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && !tasks.length && (
              <tr>
                <td colSpan={9} style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
                  {search || filterType || filterStatus ? 'No tasks match your filters' : 'No tasks yet — click "+ NEW TASK" to begin monitoring'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
          <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>Page {page} of {totalPages}</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button disabled={page === 1} onClick={() => setPage(p => p - 1)} style={{ ...inp, cursor: page === 1 ? 'not-allowed' : 'pointer', opacity: page === 1 ? 0.3 : 1 }}>← Prev</button>
            <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)} style={{ ...inp, cursor: page === totalPages ? 'not-allowed' : 'pointer', opacity: page === totalPages ? 0.3 : 1 }}>Next →</button>
          </div>
        </div>
      )}
    </div>
  )
}
