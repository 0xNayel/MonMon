import { useEffect, useState } from 'react'
import api from '../api'

interface AlertConfig {
  id: number
  task_id: number | null
  name: string
  provider: string
  provider_config: string
  enabled: boolean
  on_change: boolean
  on_error: boolean
  keyword_filter: string
  message_template: string
}

const DEFAULT_TEMPLATE = `MonMon: \`{{.TaskName}}\`
Type: \`{{.TaskType}}\`
Status: \`{{.CheckStatus}}\`
Version: \`#{{.CheckVersion}}\`
Duration: \`{{.DurationMs}}ms\`{{if .HasDiff}}
Changes: \`+{{.DiffAdded}} -{{.DiffRemoved}}\`{{end}}`

const TEMPLATE_VARS = [
  { v: '{{.TaskName}}',     desc: 'Task name' },
  { v: '{{.TaskType}}',     desc: 'Task type (command / endpoint / subdomain / bbscope)' },
  { v: '{{.CheckStatus}}',  desc: 'Status (changed / error / no_change)' },
  { v: '{{.CheckVersion}}', desc: 'Check version number' },
  { v: '{{.DurationMs}}',   desc: 'Duration in milliseconds' },
  { v: '{{.DiffAdded}}',    desc: 'Number of added lines' },
  { v: '{{.DiffRemoved}}',  desc: 'Number of removed lines' },
  { v: '{{.DiffText}}',     desc: 'Diff content (max 50 lines)' },
  { v: '{{.HasDiff}}',      desc: 'Boolean — use in {{if .HasDiff}} blocks' },
  { v: '{{.ErrorMsg}}',     desc: 'Error message (when status = error)' },
]

type Provider = 'slack' | 'discord' | 'telegram' | 'custom'

const PROVIDERS: { value: Provider; label: string; color: string }[] = [
  { value: 'slack',    label: 'Slack',           color: '#4A154B' },
  { value: 'discord',  label: 'Discord',         color: '#5865F2' },
  { value: 'telegram', label: 'Telegram',        color: '#229ED9' },
  { value: 'custom',   label: 'Custom Webhook',  color: '#6366f1' },
]

const PROVIDER_BADGE: Record<string, { bg: string; color: string; border: string }> = {
  slack:    { bg: 'rgba(74,21,75,0.15)',   color: '#C084FC', border: 'rgba(192,132,252,0.25)' },
  discord:  { bg: 'rgba(88,101,242,0.15)', color: '#818CF8', border: 'rgba(129,140,248,0.25)' },
  telegram: { bg: 'rgba(34,158,217,0.15)', color: '#38BDF8', border: 'rgba(56,189,248,0.25)'  },
  custom:   { bg: 'rgba(99,102,241,0.1)',  color: '#6366f1', border: 'rgba(99,102,241,0.25)'  },
}

const inp: React.CSSProperties = {
  padding: '8px 12px', background: 'rgba(255,255,255,0.04)',
  border: '1px solid var(--border)', borderRadius: 8,
  color: 'var(--text-primary)', fontFamily: 'var(--font-body)',
  fontSize: 13, outline: 'none', width: '100%',
}

const formInp: React.CSSProperties = {
  ...inp, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
}

const LABEL: React.CSSProperties = {
  display: 'block', fontSize: 11, color: 'var(--text-muted)',
  marginBottom: 6, letterSpacing: '0.06em', textTransform: 'uppercase',
}

const FIELD: React.CSSProperties = { marginBottom: 14 }

function focusBorder(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) {
  e.target.style.borderColor = 'rgba(99,102,241,0.4)'
}
function blurBorder(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>, base = 'rgba(255,255,255,0.08)') {
  e.target.style.borderColor = base
}

function buildProviderConfig(provider: Provider, fields: Record<string, string>): string {
  switch (provider) {
    case 'slack':
    case 'discord':
      return JSON.stringify({ webhook_url: fields.webhook_url })
    case 'telegram':
      return JSON.stringify({ api_key: fields.api_key, chat_id: fields.chat_id })
    case 'custom':
      return JSON.stringify({ url: fields.url, method: fields.method || 'POST', content_type: fields.content_type || '' })
  }
}

// ── Provider config fields ────────────────────────────────────────────────────
function ProviderFields({
  provider,
  fields,
  onChange,
}: {
  provider: Provider
  fields: Record<string, string>
  onChange: (k: string, v: string) => void
}) {
  const F = ({ label, k, placeholder, type = 'text' }: { label: string; k: string; placeholder?: string; type?: string }) => (
    <div style={FIELD}>
      <label style={LABEL}>{label}</label>
      <input
        value={fields[k] ?? ''}
        onChange={e => onChange(k, e.target.value)}
        placeholder={placeholder}
        type={type}
        style={formInp}
        onFocus={focusBorder}
        onBlur={e => blurBorder(e)}
      />
    </div>
  )

  if (provider === 'slack' || provider === 'discord') {
    const label = provider === 'slack' ? 'Slack Webhook URL' : 'Discord Webhook URL'
    const ph = provider === 'slack'
      ? 'https://hooks.slack.com/services/...'
      : 'https://discord.com/api/webhooks/...'
    return <F label={label} k="webhook_url" placeholder={ph} />
  }

  if (provider === 'telegram') {
    return (
      <>
        <F label="Bot API Key" k="api_key" placeholder="123456789:AAABBBCCC..." />
        <F label="Chat ID" k="chat_id" placeholder="-100123456789 or @channel" />
      </>
    )
  }

  // custom
  return (
    <>
      <F label="Webhook URL" k="url" placeholder="https://your-server.com/webhook" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div style={FIELD}>
          <label style={LABEL}>Method</label>
          <select
            value={fields.method ?? 'POST'}
            onChange={e => onChange('method', e.target.value)}
            style={{ ...formInp, cursor: 'pointer' }}
            onFocus={focusBorder}
            onBlur={e => blurBorder(e)}
          >
            <option value="POST">POST</option>
            <option value="GET">GET</option>
            <option value="PUT">PUT</option>
          </select>
        </div>
        <F label="Content-Type (optional)" k="content_type" placeholder="application/json" />
      </div>
    </>
  )
}

// ── Checkbox ──────────────────────────────────────────────────────────────────
function Checkbox({ checked, onChange, label, color }: { checked: boolean; onChange: () => void; label: string; color: string }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--text-primary)' }}>
      <div
        onClick={onChange}
        style={{
          width: 18, height: 18, borderRadius: 4,
          border: `1px solid ${checked ? color : 'var(--border)'}`,
          background: checked ? `${color}20` : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', transition: 'all 0.15s', flexShrink: 0,
        }}
      >
        {checked && (
          <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke={color} strokeWidth="3">
            <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
      <span style={{ color: checked ? color : 'var(--text-muted)' }}>{label}</span>
    </label>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
const emptyForm = () => ({
  name: '', task_id: '', provider: 'slack' as Provider,
  on_change: true, on_error: false, keyword_filter: '', enabled: true,
  providerFields: {} as Record<string, string>,
  useCustomTemplate: false, messageTemplate: '',
})

export default function Alerts() {
  const [alerts,      setAlerts]      = useState<AlertConfig[]>([])
  const [showAdd,     setShowAdd]     = useState(false)
  const [search,      setSearch]      = useState('')
  const [filterScope, setFilterScope] = useState<'all' | 'global' | 'task'>('all')
  const [form,        setForm]        = useState(emptyForm)
  const [testing,     setTesting]     = useState<number | null>(null)

  const load = () => api.get('/alerts').then(r => setAlerts(r.data.data || []))
  useEffect(() => { load() }, [])

  const setField = (k: string, v: unknown) => setForm(f => ({ ...f, [k]: v }))
  const setProviderField = (k: string, v: string) =>
    setForm(f => ({ ...f, providerFields: { ...f.providerFields, [k]: v } }))

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    const provider_config = buildProviderConfig(form.provider, form.providerFields)
    try {
      await api.post('/alerts', {
        name:             form.name,
        task_id:          form.task_id ? Number(form.task_id) : null,
        provider:         form.provider,
        provider_config,
        on_change:        form.on_change,
        on_error:         form.on_error,
        keyword_filter:   form.keyword_filter,
        enabled:          form.enabled,
        message_template: form.useCustomTemplate ? form.messageTemplate : '',
      })
      setShowAdd(false)
      setForm(emptyForm())
      load()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      alert(msg || 'Failed to create alert config')
    }
  }

  const del = async (id: number) => {
    if (!confirm('Delete alert config?')) return
    await api.delete(`/alerts/${id}`); load()
  }

  const toggle = async (a: AlertConfig) => {
    await api.put(`/alerts/${a.id}`, { ...a, enabled: !a.enabled }); load()
  }

  const testAlert = async (id: number) => {
    setTesting(id)
    try {
      await api.post(`/alerts/${id}/test`)
      alert('Test alert sent!')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      alert('Test failed: ' + (msg || 'unknown error'))
    } finally {
      setTesting(null)
    }
  }

  const filtered = alerts.filter(a => {
    const matchSearch = !search || a.name.toLowerCase().includes(search.toLowerCase())
    const matchScope = filterScope === 'all' ? true : filterScope === 'global' ? !a.task_id : !!a.task_id
    return matchSearch && matchScope
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Alert Configs</h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>{alerts.length} config{alerts.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => setShowAdd(!showAdd)} style={{
          padding: '9px 18px',
          background: showAdd ? 'rgba(99,102,241,0.15)' : 'var(--accent-solid)',
          color: showAdd ? 'var(--accent)' : '#ffffff',
          border: showAdd ? '1px solid rgba(99,102,241,0.3)' : 'none',
          borderRadius: 8, cursor: 'pointer',
          fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, letterSpacing: '0.06em',
          transition: 'all 0.15s',
          boxShadow: showAdd ? 'none' : '0 0 16px rgba(99,102,241,0.25)',
        }}>
          {showAdd ? '✕ CANCEL' : '+ NEW ALERT'}
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <form onSubmit={create} style={{
          background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(12px)',
          border: '1px solid rgba(99,102,241,0.15)', borderRadius: 12, padding: '24px',
          animation: 'cascade-in 0.25s ease-out',
        }}>
          <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: 'var(--accent)', marginBottom: 20, letterSpacing: '0.08em' }}>
            NEW ALERT CONFIGURATION
          </h3>

          {/* Name + Task ID */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div>
              <label style={LABEL}>Name</label>
              <input value={form.name} onChange={e => setField('name', e.target.value)}
                placeholder="e.g. Slack — all changes" style={formInp} required
                onFocus={focusBorder} onBlur={e => blurBorder(e)} />
            </div>
            <div>
              <label style={LABEL}>Task ID <span style={{ color: 'var(--text-faint)', textTransform: 'none' }}>(empty = global)</span></label>
              <input value={form.task_id} onChange={e => setField('task_id', e.target.value)}
                placeholder="Leave empty to apply to all tasks" style={formInp} type="number"
                onFocus={focusBorder} onBlur={e => blurBorder(e)} />
            </div>
          </div>

          {/* Provider selector */}
          <div style={FIELD}>
            <label style={LABEL}>Provider</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {PROVIDERS.map(p => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => { setField('provider', p.value); setField('providerFields', {}) }}
                  style={{
                    padding: '7px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13,
                    fontFamily: 'var(--font-mono)', transition: 'all 0.15s',
                    background: form.provider === p.value ? `${p.color}22` : 'rgba(255,255,255,0.04)',
                    color:      form.provider === p.value ? p.color : 'var(--text-muted)',
                    border:     form.provider === p.value ? `1px solid ${p.color}55` : '1px solid var(--border)',
                    fontWeight: form.provider === p.value ? 600 : 400,
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Dynamic provider config */}
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '16px', marginBottom: 14 }}>
            <ProviderFields
              provider={form.provider}
              fields={form.providerFields}
              onChange={setProviderField}
            />
          </div>

          {/* Keyword filter */}
          <div style={FIELD}>
            <label style={LABEL}>Keyword Filter <span style={{ color: 'var(--text-faint)', textTransform: 'none' }}>(only alert if output contains this)</span></label>
            <input value={form.keyword_filter} onChange={e => setField('keyword_filter', e.target.value)}
              placeholder="Optional — leave empty to always alert" style={formInp}
              onFocus={focusBorder} onBlur={e => blurBorder(e)} />
          </div>

          {/* Trigger checkboxes */}
          <div style={{ display: 'flex', gap: 24, marginBottom: 20 }}>
            <Checkbox checked={form.on_change} onChange={() => setField('on_change', !form.on_change)} label="Alert on Change" color="var(--accent)" />
            <Checkbox checked={form.on_error}  onChange={() => setField('on_error',  !form.on_error)}  label="Alert on Error"  color="var(--critical)" />
            <Checkbox checked={form.enabled}   onChange={() => setField('enabled',   !form.enabled)}   label="Enabled"        color="#38BDF8" />
          </div>

          {/* Message template */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <label style={LABEL}>Message Template</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {(['default', 'custom'] as const).map(mode => (
                  <button key={mode} type="button"
                    onClick={() => setField('useCustomTemplate', mode === 'custom')}
                    style={{
                      padding: '4px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                      fontFamily: 'var(--font-mono)', transition: 'all 0.15s',
                      background: (mode === 'custom') === form.useCustomTemplate ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.04)',
                      color:      (mode === 'custom') === form.useCustomTemplate ? 'var(--accent)' : 'var(--text-muted)',
                      border:     (mode === 'custom') === form.useCustomTemplate ? '1px solid rgba(99,102,241,0.3)' : '1px solid var(--border)',
                    }}
                  >{mode}</button>
                ))}
              </div>
            </div>

            {!form.useCustomTemplate ? (
              <pre style={{
                background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 8, padding: '12px 14px', fontSize: 12, color: 'var(--text-muted)',
                fontFamily: 'var(--font-mono)', lineHeight: 1.7, margin: 0, whiteSpace: 'pre-wrap',
              }}>{DEFAULT_TEMPLATE}</pre>
            ) : (
              <div>
                <textarea
                  value={form.messageTemplate || DEFAULT_TEMPLATE}
                  onChange={e => setField('messageTemplate', e.target.value)}
                  rows={8}
                  style={{
                    ...formInp, resize: 'vertical', lineHeight: 1.7,
                    fontFamily: 'var(--font-mono)', fontSize: 12,
                  }}
                  onFocus={e => (e.target.style.borderColor = 'rgba(99,102,241,0.4)')}
                  onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.08)')}
                />
                <div style={{
                  marginTop: 10, background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.05)', borderRadius: 8, padding: '12px 14px',
                }}>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Available variables</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px' }}>
                    {TEMPLATE_VARS.map(({ v, desc }) => (
                      <div key={v} style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                        <code
                          onClick={() => setField('messageTemplate', (form.messageTemplate || DEFAULT_TEMPLATE) + v)}
                          style={{
                            fontSize: 11, color: 'var(--accent)', fontFamily: 'var(--font-mono)',
                            cursor: 'pointer', flexShrink: 0,
                          }}
                          title="Click to insert"
                        >{v}</code>
                        <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{desc}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" onClick={() => setShowAdd(false)} style={{
              padding: '9px 18px', background: 'none', border: '1px solid var(--border)',
              borderRadius: 8, cursor: 'pointer', color: 'var(--text-muted)',
              fontFamily: 'var(--font-body)', fontSize: 13,
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
      <div style={{ display: 'flex', gap: 10 }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by name..." style={{ ...inp, width: 220 }}
          onFocus={e => (e.target.style.borderColor = 'rgba(99,102,241,0.4)')}
          onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
        <select value={filterScope} onChange={e => setFilterScope(e.target.value as never)}
          style={{ ...inp, width: 'auto', cursor: 'pointer' }}>
          <option value="all">All scopes</option>
          <option value="global">Global only</option>
          <option value="task">Task-specific</option>
        </select>
      </div>

      {/* Table */}
      <div style={{ background: 'var(--bg-card)', backdropFilter: 'blur(12px)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['Name', 'Provider', 'Scope', 'Triggers', 'Keyword', 'Status', ''].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '12px 16px', fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(a => {
              const badge = PROVIDER_BADGE[a.provider] ?? PROVIDER_BADGE.custom
              return (
                <tr key={a.id} style={{ borderBottom: '1px solid var(--border-subtle)', transition: 'background 0.1s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.025)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <td style={{ padding: '12px 16px', fontWeight: 500, color: 'var(--text-primary)' }}>{a.name}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ padding: '3px 9px', background: badge.bg, color: badge.color, border: `1px solid ${badge.border}`, borderRadius: 6, fontSize: 12, fontFamily: 'var(--font-mono)' }}>
                      {a.provider}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    {a.task_id
                      ? <span style={{ padding: '3px 9px', background: 'rgba(56,189,248,0.1)', color: '#38BDF8', border: '1px solid rgba(56,189,248,0.2)', borderRadius: 6, fontSize: 12 }}>Task #{a.task_id}</span>
                      : <span style={{ padding: '3px 9px', background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12 }}>Global</span>
                    }
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {a.on_change && <span style={{ padding: '3px 9px', background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 6, fontSize: 12 }}>change</span>}
                      {a.on_error  && <span style={{ padding: '3px 9px', background: 'var(--critical-dim)', color: 'var(--critical)', border: '1px solid rgba(255,59,92,0.2)', borderRadius: 6, fontSize: 12 }}>error</span>}
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)', fontSize: 12, color: a.keyword_filter ? 'var(--text-muted)' : 'var(--text-faint)' }}>
                    {a.keyword_filter || '—'}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <button onClick={() => toggle(a)} style={{
                      padding: '3px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      fontFamily: 'var(--font-mono)', transition: 'all 0.15s',
                      background: a.enabled ? 'rgba(99,102,241,0.1)' : 'rgba(255,255,255,0.04)',
                      color:      a.enabled ? 'var(--accent)' : 'var(--text-faint)',
                      border:     a.enabled ? '1px solid rgba(99,102,241,0.25)' : '1px solid var(--border)',
                    }}>
                      {a.enabled ? '● ON' : '○ OFF'}
                    </button>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => testAlert(a.id)} disabled={testing === a.id} style={{
                        padding: '4px 10px', background: 'rgba(56,189,248,0.08)', color: '#38BDF8',
                        border: '1px solid rgba(56,189,248,0.2)', borderRadius: 6, cursor: 'pointer', fontSize: 12,
                        opacity: testing === a.id ? 0.5 : 1,
                      }}>{testing === a.id ? '...' : 'Test'}</button>
                      <button onClick={() => del(a.id)} style={{
                        padding: '4px 10px', background: 'var(--critical-dim)', color: 'var(--critical)',
                        border: '1px solid rgba(255,59,92,0.2)', borderRadius: 6, cursor: 'pointer', fontSize: 12,
                      }}>Delete</button>
                    </div>
                  </td>
                </tr>
              )
            })}
            {!filtered.length && (
              <tr>
                <td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
                  {alerts.length === 0 ? 'No alert configs yet — create one to start receiving notifications' : 'No configs match filters'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
