import { useState, useEffect } from 'react'

interface Props {
  type: string
  value: string
  onChange: (json: string) => void
}

const inp: React.CSSProperties = {
  width: '100%', padding: '9px 12px',
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 8, color: 'var(--text-primary)',
  fontFamily: 'var(--font-body)', fontSize: 13, outline: 'none',
  transition: 'border-color 0.15s',
}

const sel: React.CSSProperties = { ...inp, cursor: 'pointer' }

const label: React.CSSProperties = {
  display: 'block', fontSize: 11, color: 'var(--text-muted)',
  marginBottom: 6, letterSpacing: '0.06em', textTransform: 'uppercase' as const,
}

function Field({ name, hint, children }: { name: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={label}>{name}</label>
      {hint && <p style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 6 }}>{hint}</p>}
      {children}
    </div>
  )
}

function Toggle({ checked, onChange, label: lbl }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
      <div
        onClick={() => onChange(!checked)}
        style={{
          width: 36, height: 20, borderRadius: 10, position: 'relative', cursor: 'pointer',
          background: checked ? 'var(--accent-solid)' : 'rgba(255,255,255,0.1)',
          transition: 'background 0.2s', flexShrink: 0,
        }}
      >
        <div style={{
          position: 'absolute', top: 2, left: checked ? 18 : 2, width: 16, height: 16,
          borderRadius: '50%', background: '#fff', transition: 'left 0.2s',
        }} />
      </div>
      <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{lbl}</span>
    </label>
  )
}

function focusBorder(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
  e.target.style.borderColor = 'var(--accent-glow)'
}
function blurBorder(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
  e.target.style.borderColor = 'rgba(255,255,255,0.08)'
}

export default function ConfigForm({ type, value, onChange }: Props) {
  // ── Endpoint ────────────────────────────────────────────────────────────────
  const [urls,       setUrls]       = useState('')
  const [mode,       setMode]       = useState('body')
  const [method,     setMethod]     = useState('GET')
  const [headers,    setHeaders]    = useState('')
  const [regex,      setRegex]      = useState('')
  const [epTimeout,  setEpTimeout]  = useState('')

  // ── Command ─────────────────────────────────────────────────────────────────
  const [command,    setCommand]    = useState('')
  const [outputMode, setOutputMode] = useState('stdout')
  const [outputFile, setOutputFile] = useState('')
  const [cmdTimeout, setCmdTimeout] = useState('')

  // ── Subdomain ────────────────────────────────────────────────────────────────
  const [domains,    setDomains]    = useState('')
  const [httpxSC,    setHttpxSC]    = useState(true)
  const [httpxCT,    setHttpxCT]    = useState(false)
  const [httpxTitle, setHttpxTitle] = useState(true)
  const [httpxTD,    setHttpxTD]    = useState(false)
  const [threads,    setThreads]    = useState('5')

  // ── Bbscope ─────────────────────────────────────────────────────────────────
  const [bbPlatform,   setBbPlatform]   = useState('h1')
  const [bbToken,      setBbToken]      = useState('')
  const [bbUsername,   setBbUsername]   = useState('')
  const [bbEmail,      setBbEmail]      = useState('')
  const [bbPassword,   setBbPassword]   = useState('')
  const [bbOtpSecret,  setBbOtpSecret]  = useState('')
  const [bbBounty,     setBbBounty]     = useState(true)
  const [bbOutputType, setBbOutputType] = useState('tc')

  // ── Load from value ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!value) return
    try {
      const cfg = JSON.parse(value)
      if (type === 'endpoint') {
        setUrls((cfg.urls || []).join('\n'))
        setMode(cfg.monitor_mode || 'body')
        setMethod(cfg.method || 'GET')
        setHeaders(cfg.headers ? Object.entries(cfg.headers).map(([k, v]) => `${k}: ${v}`).join('\n') : '')
        setRegex(cfg.regex_pattern || '')
        setEpTimeout(cfg.timeout_sec ? String(cfg.timeout_sec) : '')
      } else if (type === 'command') {
        setCommand(cfg.command || '')
        setOutputMode(cfg.output_mode || 'stdout')
        setOutputFile(cfg.output_file || '')
        setCmdTimeout(cfg.timeout_sec ? String(cfg.timeout_sec) : '')
      } else if (type === 'subdomain') {
        setDomains((cfg.domains || []).join('\n'))
        setHttpxSC(cfg.httpx_sc    ?? true)
        setHttpxCT(cfg.httpx_ct    ?? false)
        setHttpxTitle(cfg.httpx_title ?? true)
        setHttpxTD(cfg.httpx_td    ?? false)
        setThreads(cfg.threads ? String(cfg.threads) : '5')
      } else if (type === 'bbscope') {
        setBbPlatform(cfg.platform || 'h1')
        setBbToken(cfg.token || '')
        setBbUsername(cfg.username || '')
        setBbEmail(cfg.email || '')
        setBbPassword(cfg.password || '')
        setBbOtpSecret(cfg.otp_secret || cfg.otp_command || '')
        setBbBounty(cfg.bounty_only ?? true)
        setBbOutputType(cfg.output_type || 'tc')
      }
    } catch { /* ignore */ }
  }, [type])

  // ── Emit changes ────────────────────────────────────────────────────────────
  useEffect(() => {
    let cfg: Record<string, unknown> = {}
    if (type === 'endpoint') {
      const urlList = urls.split('\n').map(u => u.trim()).filter(Boolean)
      cfg = { urls: urlList, monitor_mode: mode, method }
      if (headers) {
        const h: Record<string, string> = {}
        headers.split('\n').forEach(line => {
          const idx = line.indexOf(':')
          if (idx > 0) h[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
        })
        if (Object.keys(h).length) cfg.headers = h
      }
      if (mode === 'regex' && regex) cfg.regex_pattern = regex
      if (epTimeout) cfg.timeout_sec = Number(epTimeout)
    } else if (type === 'command') {
      cfg = { command, output_mode: outputMode }
      if (outputMode === 'file' && outputFile) cfg.output_file = outputFile
      if (cmdTimeout) cfg.timeout_sec = Number(cmdTimeout)
    } else if (type === 'subdomain') {
      const domainList = domains.split('\n').map(d => d.trim()).filter(Boolean)
      cfg = {
        domains: domainList,
        httpx_sc: httpxSC, httpx_ct: httpxCT,
        httpx_title: httpxTitle, httpx_td: httpxTD,
        threads: Number(threads) || 5,
      }
    } else if (type === 'bbscope') {
      cfg = {
        platform: bbPlatform,
        bounty_only: bbBounty,
        output_type: bbOutputType,
      }
      if (bbPlatform === 'h1') {
        if (bbToken)    cfg.token    = bbToken
        if (bbUsername) cfg.username = bbUsername
      } else if (bbPlatform === 'bc') {
        if (bbToken)      cfg.token      = bbToken
        if (bbEmail)      cfg.email      = bbEmail
        if (bbPassword)   cfg.password   = bbPassword
        if (bbOtpSecret)  cfg.otp_secret = bbOtpSecret
      } else if (bbPlatform === 'it') {
        if (bbToken) cfg.token = bbToken
      } else if (bbPlatform === 'ywh') {
        if (bbToken)     cfg.token      = bbToken
        if (bbEmail)     cfg.email      = bbEmail
        if (bbPassword)  cfg.password   = bbPassword
        if (bbOtpSecret) cfg.otp_secret = bbOtpSecret
      }
    }
    onChange(JSON.stringify(cfg))
  }, [
    type, urls, mode, method, headers, regex, epTimeout,
    command, outputMode, outputFile, cmdTimeout,
    domains, httpxSC, httpxCT, httpxTitle, httpxTD, threads,
    bbPlatform, bbToken, bbUsername, bbEmail, bbPassword, bbOtpSecret, bbBounty, bbOutputType,
  ])

  const grid2: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }

  // ── Endpoint form ────────────────────────────────────────────────────────────
  if (type === 'endpoint') return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Field name="URLs (one per line)">
        <textarea value={urls} onChange={e => setUrls(e.target.value)} rows={3}
          placeholder={"https://example.com/api\nhttps://example.com/health"}
          style={{ ...inp, resize: 'none' as const }}
          onFocus={focusBorder} onBlur={blurBorder} />
      </Field>
      <div style={grid2}>
        <Field name="Monitor Mode">
          <select value={mode} onChange={e => setMode(e.target.value)} style={sel} onFocus={focusBorder} onBlur={blurBorder}>
            <option value="body">Body — full response</option>
            <option value="full">Full — headers + body</option>
            <option value="metadata">Metadata — status, length</option>
            <option value="regex">Regex — pattern match</option>
          </select>
        </Field>
        <Field name="HTTP Method">
          <select value={method} onChange={e => setMethod(e.target.value)} style={sel} onFocus={focusBorder} onBlur={blurBorder}>
            <option>GET</option><option>POST</option><option>PUT</option><option>HEAD</option>
          </select>
        </Field>
      </div>
      {mode === 'regex' && (
        <Field name="Regex Pattern">
          <input value={regex} onChange={e => setRegex(e.target.value)}
            placeholder="e.g. version:\s*([\d.]+)" style={inp} onFocus={focusBorder} onBlur={blurBorder} />
        </Field>
      )}
      <div style={grid2}>
        <Field name="Headers (Key: Value, one per line)">
          <textarea value={headers} onChange={e => setHeaders(e.target.value)} rows={2}
            placeholder={"Authorization: Bearer token\nX-API-Key: secret"}
            style={{ ...inp, resize: 'none' as const }}
            onFocus={focusBorder} onBlur={blurBorder} />
        </Field>
        <Field name="Timeout (seconds)">
          <input value={epTimeout} onChange={e => setEpTimeout(e.target.value)} type="number" placeholder="0 = disabled" style={inp} onFocus={focusBorder} onBlur={blurBorder} />
        </Field>
      </div>
    </div>
  )

  // ── Command form ─────────────────────────────────────────────────────────────
  if (type === 'command') return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Field name="Command">
        <input value={command} onChange={e => setCommand(e.target.value)}
          placeholder="e.g. cat /etc/passwd | wc -l" style={inp} onFocus={focusBorder} onBlur={blurBorder} />
      </Field>
      <div style={grid2}>
        <Field name="Output Mode">
          <select value={outputMode} onChange={e => setOutputMode(e.target.value)} style={sel} onFocus={focusBorder} onBlur={blurBorder}>
            <option value="stdout">Stdout — capture output</option>
            <option value="file">File — read after run</option>
          </select>
        </Field>
        <Field name="Timeout (seconds)">
          <input value={cmdTimeout} onChange={e => setCmdTimeout(e.target.value)} type="number" placeholder="0 = disabled" style={inp} onFocus={focusBorder} onBlur={blurBorder} />
        </Field>
      </div>
      {outputMode === 'file' && (
        <Field name="Output File Path">
          <input value={outputFile} onChange={e => setOutputFile(e.target.value)} placeholder="/var/log/app.log" style={inp} onFocus={focusBorder} onBlur={blurBorder} />
        </Field>
      )}
    </div>
  )

  // ── Subdomain form ───────────────────────────────────────────────────────────
  if (type === 'subdomain') return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Field name="Domains (one per line)">
        <textarea value={domains} onChange={e => setDomains(e.target.value)} rows={3}
          placeholder={"example.com\ntarget.io"}
          style={{ ...inp, resize: 'none' as const }}
          onFocus={focusBorder} onBlur={blurBorder} />
      </Field>

      <div>
        <label style={label}>httpx options</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: '12px', background: 'rgba(255,255,255,0.02)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
          <Toggle checked={httpxSC}    onChange={setHttpxSC}    label="-sc  status code" />
          <Toggle checked={httpxCT}    onChange={setHttpxCT}    label="-ct  content type" />
          <Toggle checked={httpxTitle} onChange={setHttpxTitle} label="-title  page title" />
          <Toggle checked={httpxTD}    onChange={setHttpxTD}    label="-td  tech detect" />
        </div>
      </div>

      <Field name="Parallel threads" hint="Each domain runs the full subfinder → httpx pipeline as a separate process. This limits how many run at once.">
        <input value={threads} onChange={e => setThreads(e.target.value)} type="number" min="1" max="20"
          placeholder="5" style={{ ...inp, width: 100 }} onFocus={focusBorder} onBlur={blurBorder} />
      </Field>
    </div>
  )

  // ── Bbscope form ─────────────────────────────────────────────────────────────
  if (type === 'bbscope') return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={grid2}>
        <Field name="Platform">
          <select value={bbPlatform} onChange={e => setBbPlatform(e.target.value)} style={sel} onFocus={focusBorder} onBlur={blurBorder}>
            <option value="h1">HackerOne (h1)</option>
            <option value="bc">Bugcrowd (bc)</option>
            <option value="it">Intigriti (it)</option>
            <option value="ywh">YesWeHack (ywh)</option>
          </select>
        </Field>
        <Field name="Output type">
          <select value={bbOutputType} onChange={e => setBbOutputType(e.target.value)} style={sel} onFocus={focusBorder} onBlur={blurBorder}>
            <option value="tc">tc — targets + category</option>
            <option value="t">t — targets only</option>
            <option value="tdu">tdu — targets + desc + url</option>
            <option value="tcu">tcu — targets + category + url</option>
          </select>
        </Field>
      </div>

      {bbPlatform === 'h1' && (
        <div style={grid2}>
          <Field name="API Token (-t)">
            <input value={bbToken} onChange={e => setBbToken(e.target.value)} type="password"
              placeholder="HackerOne API token" style={inp} onFocus={focusBorder} onBlur={blurBorder} />
          </Field>
          <Field name="Username (-u)">
            <input value={bbUsername} onChange={e => setBbUsername(e.target.value)}
              placeholder="h1 username" style={inp} onFocus={focusBorder} onBlur={blurBorder} />
          </Field>
        </div>
      )}

      {bbPlatform === 'bc' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field name="Session Cookie (-t)" hint="_bugcrowd_session cookie — or use email+password below">
            <input value={bbToken} onChange={e => setBbToken(e.target.value)} type="password"
              placeholder="Bugcrowd session cookie (optional if using email+password)" style={inp} onFocus={focusBorder} onBlur={blurBorder} />
          </Field>
          <div style={grid2}>
            <Field name="Email (-E)">
              <input value={bbEmail} onChange={e => setBbEmail(e.target.value)}
                placeholder="Bugcrowd email" style={inp} onFocus={focusBorder} onBlur={blurBorder} />
            </Field>
            <Field name="Password (-P)">
              <input value={bbPassword} onChange={e => setBbPassword(e.target.value)} type="password"
                placeholder="Bugcrowd password" style={inp} onFocus={focusBorder} onBlur={blurBorder} />
            </Field>
          </div>
          <Field name="TOTP Secret (-O)" hint="Base32 TOTP secret (optional)">
            <input value={bbOtpSecret} onChange={e => setBbOtpSecret(e.target.value)}
              placeholder="JBSWY3DPEHPK3PXP" style={inp} onFocus={focusBorder} onBlur={blurBorder} />
          </Field>
        </div>
      )}

      {bbPlatform === 'it' && (
        <Field name="API Token (-t)">
          <input value={bbToken} onChange={e => setBbToken(e.target.value)} type="password"
            placeholder="Intigriti API token" style={inp} onFocus={focusBorder} onBlur={blurBorder} />
        </Field>
      )}

      {bbPlatform === 'ywh' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field name="Bearer Token (-t)" hint="From api.yeswehack.com — or use email+password below">
            <input value={bbToken} onChange={e => setBbToken(e.target.value)} type="password"
              placeholder="YesWeHack API token (optional if using email+password)" style={inp} onFocus={focusBorder} onBlur={blurBorder} />
          </Field>
          <div style={grid2}>
            <Field name="Email (-E)">
              <input value={bbEmail} onChange={e => setBbEmail(e.target.value)}
                placeholder="YesWeHack email" style={inp} onFocus={focusBorder} onBlur={blurBorder} />
            </Field>
            <Field name="Password (-P)">
              <input value={bbPassword} onChange={e => setBbPassword(e.target.value)} type="password"
                placeholder="YesWeHack password" style={inp} onFocus={focusBorder} onBlur={blurBorder} />
            </Field>
          </div>
          <Field name="TOTP Secret (-O)" hint="Base32 TOTP secret (optional)">
            <input value={bbOtpSecret} onChange={e => setBbOtpSecret(e.target.value)}
              placeholder="JBSWY3DPEHPK3PXP" style={inp} onFocus={focusBorder} onBlur={blurBorder} />
          </Field>
        </div>
      )}

      <Toggle checked={bbBounty} onChange={setBbBounty} label="-b  bounty programs only" />
    </div>
  )

  return null
}
