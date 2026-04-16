import { useEffect, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { QRCodeCanvas } from 'qrcode.react'
import { supabase, STATE_CODE_REGEX, normalizeStateCode, friendlyNetworkError, getDeviceId } from '../lib/supabase.js'

export default function Manager() {
  const [fullName, setFullName] = useState('')
  const [stateCode, setStateCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [stateCodeError, setStateCodeError] = useState('')
  const [result, setResult] = useState(null)
  const [registrationOpen, setRegistrationOpen] = useState(true)
  const [copied, setCopied] = useState(false)
  const [duplicateCode, setDuplicateCode] = useState('')
  const [recentRegs, setRecentRegs] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('recent_regs') || '[]') } catch { return [] }
  })
  const [lookupCode, setLookupCode] = useState('')
  const [lookupBusy, setLookupBusy] = useState(false)
  const [lookupResult, setLookupResult] = useState(null)
  const [lookupError, setLookupError] = useState('')
  const retryCount = useRef(0)

  // Poll registration_open flag every 10 seconds + heartbeat.
  useEffect(() => {
    let cancelled = false

    async function check() {
      try {
        const { data } = await supabase
          .from('session_settings')
          .select('registration_open')
          .eq('id', 1)
          .single()
        if (!cancelled && data) setRegistrationOpen(data.registration_open)
      } catch {}
      // Heartbeat for executive session tracking
      try { await supabase.rpc('exec_heartbeat', { p_device_id: getDeviceId() || 'unknown', p_page: 'manager' }) } catch {}
    }
    check()
    const interval = setInterval(check, 10000)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  function reset() {
    setFullName('')
    setStateCode('')
    setError('')
    setStateCodeError('')
    setResult(null)
    setCopied(false)
    setDuplicateCode('')
  }

  // Executive lookup
  async function handleLookup() {
    const code = normalizeStateCode(lookupCode)
    if (!code) return
    setLookupBusy(true)
    setLookupError('')
    setLookupResult(null)
    try {
      const { data } = await supabase
        .from('registrations')
        .select('*')
        .eq('state_code', code)
        .eq('voided', false)
        .maybeSingle()
      if (data) {
        setLookupResult(data)
      } else {
        setLookupError('No registration found for this state code today.')
      }
    } catch {
      setLookupError('Could not check. Try again.')
    }
    setLookupBusy(false)
  }

  // Save to recent registrations (for QR persistence)
  function saveRecent(data) {
    const entry = { state_code: data.state_code, full_name: data.full_name, queue_number: data.queue_number, batch_number: data.batch_number, ts: Date.now() }
    const updated = [entry, ...recentRegs.filter(r => r.state_code !== data.state_code)].slice(0, 10)
    setRecentRegs(updated)
    try { sessionStorage.setItem('recent_regs', JSON.stringify(updated)) } catch {}
  }

  function handleStateCodeBlur() {
    const code = normalizeStateCode(stateCode)
    if (code && !STATE_CODE_REGEX.test(code)) {
      setStateCodeError('State code format: XX/00X/0000 - e.g. LA/24A/1234 or LA/25B/11622.')
    } else {
      setStateCodeError('')
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setStateCodeError('')

    const code = normalizeStateCode(stateCode)
    const name = fullName.trim()

    if (!name) return setError('Enter the corps member\u2019s full name.')
    if (!STATE_CODE_REGEX.test(code)) {
      setStateCodeError('State code format: XX/00X/0000 \u2014 e.g. LA/24A/1234 or LA/25B/11622.')
      return
    }

    setBusy(true)
    retryCount.current = 0

    async function attempt() {
      try {
        const { data, error: rpcError } = await supabase.rpc('register_corps_member', {
          p_state_code: code,
          p_full_name: name,
          p_device_id: null
        })

        if (rpcError) {
          const msg = rpcError.message || ''
          if (msg.includes('duplicate_state_code')) {
            setError('This state code has already registered today.')
            setDuplicateCode(code)
          } else if (msg.includes('registration_closed')) {
            setError('Registration is closed for the day.')
          } else if (msg.includes('register_corps_member') || (msg.includes('function') && msg.includes('does not exist'))) {
            setError('Database not set up yet. An executive must run the SQL setup file in Supabase before registrations can be saved.')
          } else if (friendlyNetworkError(msg)) {
            if (retryCount.current < 3) {
              retryCount.current += 1
              setError(`Network error. Retrying... (${retryCount.current}/3)`)
              setTimeout(attempt, 2000 * retryCount.current)
              return
            }
            setError(friendlyNetworkError(msg))
          } else {
            setError(msg || 'Could not register. Try again.')
          }
          setBusy(false)
          console.error('[manager] register error', rpcError)
          return
        }
        setResult(data)
        saveRecent(data)
        setBusy(false)
      } catch (err) {
        if (retryCount.current < 3) {
          retryCount.current += 1
          setError(`Connection lost. Retrying... (${retryCount.current}/3)`)
          setTimeout(attempt, 2000 * retryCount.current)
          return
        }
        setError(err.message || 'Network error. Try again.')
        setBusy(false)
      }
    }

    await attempt()
  }

  async function copyStatusUrl(url) {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback
      const input = document.createElement('input')
      input.value = url
      document.body.appendChild(input)
      input.select()
      document.execCommand('copy')
      document.body.removeChild(input)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  if (!registrationOpen && !result) {
    return (
      <div className="max-w-md mx-auto p-6 mt-10">
        <div className="bg-amber-100 border-2 border-amber-500 rounded-xl p-6 text-center">
          <div className="text-5xl mb-3">{'\uD83D\uDEAB'}</div>
          <h1 className="text-2xl font-extrabold text-amber-900">Registration closed for the day</h1>
          <p className="text-amber-900 mt-2">Please direct corps members to come back on the next CDS day.</p>
        </div>
      </div>
    )
  }

  if (result) {
    const statusUrl = `${window.location.origin}/status/${encodeURIComponent(result.state_code)}`
    return (
      <div className="max-w-md mx-auto p-4 sm:p-6">
        <div className="bg-white rounded-2xl shadow-lg border border-emerald-200 p-6 mt-4">
          <div className="text-center">
            <div className="text-sm uppercase tracking-wider text-emerald-700 font-bold">Registered {'\u00B7'} Eti-Osa 3 Special CDS</div>
            <div className="mt-1 text-xl font-semibold text-slate-900 break-words">{result.full_name}</div>
            <div className="text-slate-700 text-sm">{result.state_code}</div>
          </div>

          {/* Wave boundary badge */}
          {recentRegs.length > 1 && recentRegs[1].batch_number !== result.batch_number && (
            <div className="mt-3 bg-amber-100 border border-amber-400 text-amber-900 rounded-lg px-3 py-1.5 text-xs font-bold text-center">
              {'\u26A0\uFE0F'} New wave started! This person is in Wave {result.batch_number}.
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 mt-5">
            <div className="bg-emerald-50 rounded-xl p-4 text-center">
              <div className="text-xs uppercase text-emerald-700 font-bold">Queue #</div>
              <div className="text-4xl font-extrabold text-emerald-900 leading-none mt-1">
                {result.queue_number}
              </div>
            </div>
            <div className="bg-slate-100 rounded-xl p-4 text-center">
              <div className="text-xs uppercase text-slate-700 font-bold">Wave</div>
              <div className="text-4xl font-extrabold text-slate-900 leading-none mt-1">
                {result.batch_number}
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-col items-center">
            <div className="bg-white p-3 rounded-lg border border-slate-200">
              <QRCodeCanvas value={statusUrl} size={196} includeMargin={false} />
            </div>
            <p className="text-xs text-slate-600 mt-2 text-center">
              Corps member scans this with their phone to track status.
            </p>
            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={() => copyStatusUrl(statusUrl)}
                className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg transition-colors"
              >
                {copied ? '\u2713 Copied!' : 'Copy link'}
              </button>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(`Eti-Osa 3 Special CDS\nYou are registered! Queue #${result.queue_number}, Wave ${result.batch_number}.\nTrack your status here:\n${statusUrl}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-semibold text-green-700 hover:text-green-900 bg-green-50 hover:bg-green-100 px-3 py-1.5 rounded-lg transition-colors"
              >
                WhatsApp
              </a>
              <button
                onClick={() => {
                  const printWin = window.open('', '_blank', 'width=400,height=500')
                  printWin.document.write(`<html><head><title>Queue Ticket</title><style>body{font-family:sans-serif;text-align:center;padding:20px}h1{font-size:18px;margin:0}h2{font-size:48px;margin:10px 0}.info{font-size:14px;color:#555;margin:4px 0}.line{border-top:1px dashed #ccc;margin:15px 0}</style></head><body><h1>Eti-Osa 3 Special CDS</h1><div class="line"></div><div class="info">${result.full_name}</div><div class="info" style="font-family:monospace">${result.state_code}</div><div class="line"></div><div class="info">QUEUE NUMBER</div><h2>#${result.queue_number}</h2><div class="info">Wave ${result.batch_number}</div><div class="line"></div><div class="info" style="font-size:11px">Track status: ${statusUrl}</div></body></html>`)
                  printWin.document.close()
                  printWin.print()
                }}
                className="text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-colors"
              >
                Print
              </button>
            </div>
          </div>

          <button
            onClick={reset}
            className="w-full mt-6 bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 text-white font-bold py-4 rounded-xl text-lg"
          >
            Next corps member {'\u2192'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-md mx-auto p-4 sm:p-6">
      <h1 className="text-2xl font-extrabold text-slate-900 mt-2">Register corps member</h1>
      <p className="text-slate-700 text-sm">Eti-Osa 3 Special CDS {'\u00B7'} Entrance check-in</p>

      <form onSubmit={handleSubmit} className="mt-5 bg-white rounded-2xl shadow border border-slate-200 p-5 space-y-4">
        <label className="block">
          <span className="text-sm font-semibold text-slate-700">Full name</span>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            maxLength={200}
            autoComplete="off"
            autoCapitalize="words"
            className="mt-1 w-full rounded-lg border-2 border-slate-300 focus:border-emerald-700 focus:outline-none px-3 py-3 text-lg"
            placeholder="e.g. Adaeze Okonkwo"
            disabled={busy}
          />
        </label>

        <label className="block">
          <span className="text-sm font-semibold text-slate-700">State code</span>
          <input
            type="text"
            value={stateCode}
            onChange={(e) => { setStateCode(e.target.value.toUpperCase()); setStateCodeError('') }}
            onBlur={handleStateCodeBlur}
            onFocus={() => setStateCodeError('')}
            maxLength={20}
            autoComplete="off"
            autoCapitalize="characters"
            className={`mt-1 w-full rounded-lg border-2 focus:outline-none px-3 py-3 text-lg font-mono tracking-wider ${stateCodeError ? 'border-red-400 focus:border-red-500' : 'border-slate-300 focus:border-emerald-700'}`}
            placeholder="LA/24A/1234"
            disabled={busy}
          />
          {stateCodeError && (
            <div className="text-red-700 text-sm font-semibold mt-1">{stateCodeError}</div>
          )}
        </label>

        {error && (
          <div className="bg-red-50 border-2 border-red-300 text-red-800 rounded-lg px-3 py-2 text-sm font-semibold">
            {error}
            {duplicateCode && (
              <Link
                to={`/status/${encodeURIComponent(duplicateCode)}`}
                className="block mt-1.5 text-emerald-700 underline font-bold"
              >
                View their status page {'\u2192'}
              </Link>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 disabled:bg-slate-400 text-white font-bold py-4 rounded-xl text-lg"
        >
          {busy ? 'Registering\u2026' : 'Register & generate QR'}
        </button>
      </form>

      {/* Executive lookup */}
      <div className="mt-4 bg-white rounded-2xl shadow border border-slate-200 p-4">
        <p className="text-sm font-semibold text-slate-700">Look up a registration</p>
        <div className="mt-2 flex gap-2">
          <input
            type="text"
            value={lookupCode}
            onChange={(e) => { setLookupCode(e.target.value.toUpperCase()); setLookupError(''); setLookupResult(null) }}
            maxLength={20}
            autoComplete="off"
            autoCapitalize="characters"
            className="flex-1 rounded-lg border-2 border-slate-300 focus:border-emerald-700 focus:outline-none px-3 py-2.5 text-sm font-mono tracking-wider"
            placeholder="Enter state code"
          />
          <button
            onClick={handleLookup}
            disabled={lookupBusy || !lookupCode.trim()}
            className="bg-slate-700 hover:bg-slate-800 disabled:bg-slate-400 text-white font-bold px-4 py-2.5 rounded-lg text-sm whitespace-nowrap"
          >
            {lookupBusy ? 'Searching...' : 'Search'}
          </button>
        </div>
        {lookupError && <p className="text-red-700 text-xs font-semibold mt-1.5">{lookupError}</p>}
        {lookupResult && (
          <div className="mt-2 bg-emerald-50 rounded-lg p-3 flex items-center justify-between">
            <div>
              <div className="text-sm font-bold text-slate-900">{lookupResult.full_name}</div>
              <div className="text-xs text-slate-600 font-mono">{lookupResult.state_code} {'\u00B7'} Q#{lookupResult.queue_number} {'\u00B7'} Wave {lookupResult.batch_number}</div>
            </div>
            <Link
              to={`/status/${encodeURIComponent(lookupResult.state_code)}`}
              className="text-xs font-bold text-emerald-700 underline whitespace-nowrap"
            >
              Status page
            </Link>
          </div>
        )}
      </div>

      {/* Recent registrations */}
      {recentRegs.length > 0 && (
        <div className="mt-4 bg-white rounded-2xl shadow border border-slate-200 p-4">
          <p className="text-sm font-semibold text-slate-700">Recent registrations</p>
          <div className="mt-2 divide-y divide-slate-100">
            {recentRegs.slice(0, 5).map((r) => (
              <div key={r.state_code} className="flex items-center justify-between py-2">
                <div>
                  <div className="text-sm font-semibold text-slate-900">{r.full_name}</div>
                  <div className="text-xs text-slate-600 font-mono">Q#{r.queue_number} {'\u00B7'} Wave {r.batch_number}</div>
                </div>
                <Link
                  to={`/status/${encodeURIComponent(r.state_code)}`}
                  className="text-xs font-bold text-emerald-700 underline whitespace-nowrap"
                >
                  View QR
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
