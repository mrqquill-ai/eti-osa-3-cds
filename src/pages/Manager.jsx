import { useEffect, useState, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { QRCodeCanvas } from 'qrcode.react'
import { Users, Clock, Activity, Layers , Link2, Copy, Download, Share2, ScanLine } from 'lucide-react'
import jsQR from 'jsqr'
import { supabase, STATE_CODE_REGEX, normalizeStateCode, friendlyNetworkError, getDeviceId } from '../lib/supabase.js'

const G    = '#1B6B3A'
const MUTED = '#64748B'
const INK   = '#0F172A'
const LINE  = '#E2E8F0'

export default function Manager() {
  const navigate = useNavigate()

  const [isSuperAdmin, setIsSuperAdmin] = useState(false)

  // Redirect to /login if no active session
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) navigate('/login', { replace: true })
      else setIsSuperAdmin(session.user?.user_metadata?.role === 'super_admin')
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session) navigate('/login', { replace: true })
      else setIsSuperAdmin(session.user?.user_metadata?.role === 'super_admin')
    })
    return () => subscription.unsubscribe()
  }, [navigate])

  const [fullName,        setFullName]        = useState('')
  const [stateCode,       setStateCode]       = useState('')
  const [busy,            setBusy]            = useState(false)
  const [error,           setError]           = useState('')
  const [stateCodeError,  setStateCodeError]  = useState('')
  const [result,          setResult]          = useState(null)
  const [registrationOpen,setRegistrationOpen]= useState(true)
  const [copied,          setCopied]          = useState(false)
  const [duplicateCode,   setDuplicateCode]   = useState('')
  const [recentRegs,      setRecentRegs]      = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('recent_regs') || '[]') } catch { return [] }
  })
  const [lookupCode,      setLookupCode]      = useState('')
  const [lookupBusy,      setLookupBusy]      = useState(false)
  const [lookupResult,    setLookupResult]    = useState(null)
  const [lookupError,     setLookupError]     = useState('')
  const [linkCopied,      setLinkCopied]      = useState(false)
  const linkQrRef = useRef(null)

  const joinUrl = `${window.location.origin}/join`

  async function copyLink() {
    try { await navigator.clipboard.writeText(joinUrl) } catch {
      const inp = document.createElement('input')
      inp.value = joinUrl; document.body.appendChild(inp); inp.select()
      document.execCommand('copy'); document.body.removeChild(inp)
    }
    setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000)
  }

  function shareWhatsApp() {
    const text = encodeURIComponent(`Eti-Osa 3 Special CDS — Join the queue from your phone:\n${joinUrl}`)
    window.open(`https://wa.me/?text=${text}`, '_blank')
  }

  async function shareNative() {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Eti-Osa 3 CDS Check-In', text: 'Join the queue from your phone', url: joinUrl })
      } catch {}
    } else {
      await copyLink()
    }
  }

  function downloadQR() {
    const canvas = linkQrRef.current?.querySelector('canvas')
    if (!canvas) return
    // Draw onto a padded canvas for nicer output
    const pad = 24
    const out = document.createElement('canvas')
    out.width  = canvas.width  + pad * 2
    out.height = canvas.height + pad * 2
    const ctx = out.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, out.width, out.height)
    ctx.drawImage(canvas, pad, pad)
    const a = document.createElement('a')
    a.href = out.toDataURL('image/png')
    a.download = 'eti-osa-3-checkin-qr.png'
    a.click()
  }

  /* ── Live feed (desktop right panel) ── */
  const [liveRegs,    setLiveRegs]    = useState([])
  const [liveStats,   setLiveStats]   = useState({ total: 0, waiting: 0, served: 0 })
  const [currentBatch,setCurrentBatch]= useState(0)   // wave currently being served
  const [newIds,      setNewIds]      = useState(new Set())

  /* ── Auto-advance after registration ── */
  const [autoAdvance, setAutoAdvance] = useState(null) // null = off, 0–8 = countdown
  const resultQrRef = useRef(null)                     // ref to QR canvas in success card

  /* ── State-code QR scanner ── */
  const [showQRScanner,   setShowQRScanner]   = useState(false)
  const [qrScanning,      setQrScanning]      = useState(false)
  const [showJoinQR,      setShowJoinQR]      = useState(false)
  const videoRef       = useRef(null)
  const canvasRef      = useRef(null)
  const scanIntervalRef = useRef(null)

  const retryCount = useRef(0)

  /* ── Poll registration_open + heartbeat ── */
  useEffect(() => {
    let cancelled = false
    async function check() {
      try {
        const { data } = await supabase
          .from('session_settings')
          .select('registration_open, current_batch')
          .eq('id', 1)
          .single()
        if (!cancelled && data) {
          setRegistrationOpen(data.registration_open)
          setCurrentBatch(data.current_batch ?? 0)
        }
      } catch {}
      try { await supabase.rpc('exec_heartbeat', { p_device_id: getDeviceId() || 'unknown', p_page: 'manager' }) } catch {}
    }
    check()
    const interval = setInterval(check, 10000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [])

  /* ── Live registrations feed ── */
  useEffect(() => {
    async function fetchFeed() {
      const { data } = await supabase
        .from('registrations')
        .select('id, full_name, state_code, queue_number, batch_number, served_at, registered_at')
        .eq('voided', false)
        .order('registered_at', { ascending: false })
        .limit(15)
      if (data) setLiveRegs(data)

      // Quick stats
      const { data: all } = await supabase
        .from('registrations')
        .select('served_at, batch_number')
        .eq('voided', false)
      if (all) {
        const total   = all.length
        const served  = all.filter(r => !!r.served_at).length
        const waiting = all.filter(r => !r.served_at).length
        setLiveStats({ total, waiting, served })
      }
    }
    fetchFeed()

    const ch = supabase
      .channel('manager-live-feed')
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'registrations',
      }, payload => {
        const n = payload.new
        setLiveRegs(prev => [n, ...prev].slice(0, 15))
        setNewIds(prev => new Set([...prev, n.id]))
        setTimeout(() => setNewIds(prev => { const s = new Set(prev); s.delete(n.id); return s }), 3000)
        setLiveStats(prev => ({
          ...prev,
          total:   prev.total + 1,
          waiting: prev.waiting + 1,
          // currentBatch is tracked separately from session_settings poll
        }))
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'registrations',
      }, () => { fetchFeed() })
      .subscribe()

    return () => supabase.removeChannel(ch)
  }, [])

  function reset() {
    setFullName(''); setStateCode(''); setError(''); setStateCodeError('')
    setResult(null); setCopied(false); setDuplicateCode(''); setAutoAdvance(null)
  }

  /* ── Countdown tick: decrement every second, reset at 0 ── */
  useEffect(() => {
    if (autoAdvance === null) return
    if (autoAdvance === 0) { reset(); return }
    const t = setTimeout(() => setAutoAdvance(n => n - 1), 1000)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoAdvance])

  async function handleLookup() {
    const code = normalizeStateCode(lookupCode)
    if (!code) return
    setLookupBusy(true); setLookupError(''); setLookupResult(null)
    try {
      const { data } = await supabase
        .from('registrations')
        .select('*')
        .eq('state_code', code)
        .eq('voided', false)
        .maybeSingle()
      if (data) setLookupResult(data)
      else setLookupError('No registration found for this state code today.')
    } catch { setLookupError('Could not check. Try again.') }
    setLookupBusy(false)
  }

  function saveRecent(data) {
    const entry = { state_code: data.state_code, full_name: data.full_name, queue_number: data.queue_number, batch_number: data.batch_number, ts: Date.now() }
    const updated = [entry, ...recentRegs.filter(r => r.state_code !== data.state_code)].slice(0, 10)
    setRecentRegs(updated)
    try { sessionStorage.setItem('recent_regs', JSON.stringify(updated)) } catch {}
  }

  function handleStateCodeBlur() {
    const code = normalizeStateCode(stateCode)
    if (code && !STATE_CODE_REGEX.test(code)) {
      setStateCodeError('State code format: XX/00X/0000 — e.g. LA/24A/1234 or LA/25B/11622.')
    } else {
      setStateCodeError('')
    }
  }

  function startQRScan() {
    setShowQRScanner(true)
    setQrScanning(true)
    setTimeout(async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.play()
          scanIntervalRef.current = setInterval(() => {
            if (!videoRef.current || !canvasRef.current) return
            const video = videoRef.current
            const canvas = canvasRef.current
            if (video.readyState !== video.HAVE_ENOUGH_DATA) return
            canvas.width = video.videoWidth
            canvas.height = video.videoHeight
            const ctx = canvas.getContext('2d')
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
            const code = jsQR(imageData.data, imageData.width, imageData.height)
            if (code && code.data) {
              // Extract state code from a /status/STATE_CODE URL
              const match = code.data.match(/\/status\/([A-Z]{2}%2F\d{2}[A-Z]%2F\d+|[A-Z]{2}\/\d{2}[A-Z]\/\d+)/)
              if (match) {
                const scanned = decodeURIComponent(match[1])
                stopQRScan()
                setStateCode(scanned)
                setStateCodeError('')
              }
            }
          }, 250)
        }
      } catch {
        setError('Could not access camera. Make sure camera permissions are allowed.')
        setShowQRScanner(false)
        setQrScanning(false)
      }
    }, 100)
  }

  function stopQRScan() {
    if (scanIntervalRef.current) clearInterval(scanIntervalRef.current)
    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(t => t.stop())
    }
    setShowQRScanner(false)
    setQrScanning(false)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(''); setStateCodeError('')
    const code = normalizeStateCode(stateCode)
    const name = fullName.trim()
    if (!name) return setError('Enter the corps member’s full name.')
    if (!STATE_CODE_REGEX.test(code)) {
      setStateCodeError('State code format: XX/00X/0000 — e.g. LA/24A/1234 or LA/25B/11622.')
      return
    }
    setBusy(true); retryCount.current = 0

    async function attempt() {
      try {
        const { data, error: rpcError } = await supabase.rpc('register_corps_member', {
          p_state_code: code, p_full_name: name, p_device_id: null
        })
        if (rpcError) {
          const msg = rpcError.message || ''
          if (msg.includes('duplicate_state_code')) { setError('This state code has already registered today.'); setDuplicateCode(code) }
          else if (msg.includes('registration_closed')) setError('Registration is closed for the day.')
          else if (msg.includes('register_corps_member') || (msg.includes('function') && msg.includes('does not exist')))
            setError('Database not set up yet. An executive must run the SQL setup file in Supabase before registrations can be saved.')
          else if (friendlyNetworkError(msg)) {
            if (retryCount.current < 3) { retryCount.current += 1; setError(`Network error. Retrying... (${retryCount.current}/3)`); setTimeout(attempt, 2000 * retryCount.current); return }
            setError(friendlyNetworkError(msg))
          } else setError(msg || 'Could not register. Try again.')
          setBusy(false); return
        }
        setResult(data); saveRecent(data); setBusy(false); setAutoAdvance(8)
      } catch (err) {
        if (retryCount.current < 3) { retryCount.current += 1; setError(`Connection lost. Retrying... (${retryCount.current}/3)`); setTimeout(attempt, 2000 * retryCount.current); return }
        setError(err.message || 'Network error. Try again.')
        setBusy(false)
      }
    }
    await attempt()
  }

  async function copyStatusUrl(url) {
    try {
      await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000)
    } catch {
      const input = document.createElement('input'); input.value = url
      document.body.appendChild(input); input.select(); document.execCommand('copy'); document.body.removeChild(input)
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    }
  }

  /* ─── Registration closed gate ─── */
  if (!registrationOpen && !result) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
        {/* Icon */}
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
          style={{ backgroundColor: 'rgba(27,107,58,0.08)' }}>
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="#1B6B3A" strokeWidth="1.8">
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>

        {/* Text */}
        <h1 className="text-xl font-extrabold" style={{ color: '#0F172A' }}>Registration is closed</h1>
        <p className="text-sm mt-2 max-w-xs leading-relaxed" style={{ color: '#64748B' }}>
          Corps members cannot join the queue right now. Open registration from Settings when you're ready to begin.
        </p>

        {/* Quick action */}
        <button
          onClick={async () => {
            setBusy(true)
            setError('')
            try {
              const { error: e } = await supabase.rpc('admin_toggle_registration', {})
              if (e) throw e
              setRegistrationOpen(true)
            } catch (e) {
              setError(e?.message || 'Could not open registration. Try again.')
            } finally {
              setBusy(false)
            }
          }}
          disabled={busy}
          className="mt-6 px-6 py-2.5 rounded-xl text-sm font-bold text-white transition-opacity active:opacity-80 disabled:opacity-50"
          style={{ backgroundColor: '#1B6B3A' }}
        >
          {busy ? 'Opening…' : 'Open registration now'}
        </button>
        {error && (
          <p className="mt-3 text-sm font-semibold" style={{ color: '#C0392B' }}>{error}</p>
        )}
      </div>
    )
  }

  /* ─── Success screen ─── */
  if (result) {
    const statusUrl = `${window.location.origin}/status/${encodeURIComponent(result.state_code)}`
    return (
      <div className="max-w-md mx-auto p-4 sm:p-6">
        <div className="bg-white rounded-2xl shadow-lg border border-emerald-200 p-6 mt-4">
          <div className="text-center">
            <div className="text-sm uppercase tracking-wider text-emerald-700 font-bold">Registered · Eti-Osa 3 Special CDS</div>
            <div className="mt-1 text-xl font-semibold text-slate-900 break-words">{result.full_name}</div>
            <div className="text-slate-700 text-sm">{result.state_code}</div>
          </div>

          {recentRegs.length > 1 && recentRegs[1].batch_number !== result.batch_number && (
            <div className="mt-3 bg-amber-100 border border-amber-400 text-amber-900 rounded-lg px-3 py-1.5 text-xs font-bold text-center">
              ⚠️ New wave started! This person is in Wave {result.batch_number}.
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 mt-5">
            <div className="bg-emerald-50 rounded-xl p-4 text-center">
              <div className="text-xs uppercase text-emerald-700 font-bold">Queue #</div>
              <div className="text-4xl font-extrabold text-emerald-900 leading-none mt-1">{result.queue_number}</div>
            </div>
            <div className="bg-slate-100 rounded-xl p-4 text-center">
              <div className="text-xs uppercase text-slate-700 font-bold">Wave</div>
              <div className="text-4xl font-extrabold text-slate-900 leading-none mt-1">{result.batch_number}</div>
            </div>
          </div>

          <div className="mt-6 flex flex-col items-center">
            <div ref={resultQrRef} className="bg-white p-3 rounded-lg border border-slate-200">
              <QRCodeCanvas value={statusUrl} size={220} level="M" includeMargin={false} />
            </div>
            <p className="text-xs text-slate-600 mt-2 text-center">Corps member scans this with their phone to track status.</p>
            <div className="flex items-center gap-2 mt-2">
              <button onClick={() => copyStatusUrl(statusUrl)}
                className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg transition-colors">
                {copied ? '✓ Copied!' : 'Copy link'}
              </button>
              <a href={`https://wa.me/?text=${encodeURIComponent(`Eti-Osa 3 Special CDS\nYou are registered! Queue #${result.queue_number}, Wave ${result.batch_number}.\nTrack your status here:\n${statusUrl}`)}`}
                target="_blank" rel="noopener noreferrer"
                className="text-xs font-semibold text-green-700 hover:text-green-900 bg-green-50 hover:bg-green-100 px-3 py-1.5 rounded-lg transition-colors">
                WhatsApp
              </a>
              <button onClick={() => {
                const canvas = resultQrRef.current?.querySelector('canvas')
                const qrDataUrl = canvas ? canvas.toDataURL('image/png') : null
                const printWin = window.open('', '_blank', 'width=400,height=600')
                printWin.document.write(`<html><head><title>Queue Ticket</title><style>body{font-family:sans-serif;text-align:center;padding:20px}h1{font-size:18px;margin:0}h2{font-size:48px;margin:10px 0}.info{font-size:14px;color:#555;margin:4px 0}.line{border-top:1px dashed #ccc;margin:15px 0}</style></head><body><h1>Eti-Osa 3 Special CDS</h1><div class="line"></div><div class="info">${result.full_name}</div><div class="info" style="font-family:monospace">${result.state_code}</div><div class="line"></div><div class="info">QUEUE NUMBER</div><h2>#${result.queue_number}</h2><div class="info">Wave ${result.batch_number}</div><div class="line"></div>${qrDataUrl ? `<img src="${qrDataUrl}" style="width:180px;height:180px;display:block;margin:12px auto" /><div class="info" style="font-size:11px">Scan for live status</div>` : `<div class="info" style="font-size:11px">Track status: ${statusUrl}</div>`}</body></html>`)
                printWin.document.close(); printWin.print()
              }} className="text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-colors">
                Print
              </button>
            </div>
          </div>

          {/* Auto-advance countdown bar */}
          {autoAdvance !== null && (
            <div className="mt-4 h-1 rounded-full overflow-hidden" style={{ backgroundColor: '#E2E8F0' }}>
              <div
                className="h-full rounded-full transition-all duration-1000"
                style={{ width: `${(autoAdvance / 8) * 100}%`, backgroundColor: G }}
              />
            </div>
          )}

          <button
            onClick={() => { setAutoAdvance(null); reset() }}
            className="w-full mt-3 text-white font-bold py-4 rounded-xl text-base transition-colors active:opacity-80"
            style={{ backgroundColor: G }}
          >
            {autoAdvance !== null
              ? `Next corps member (${autoAdvance}s) →`
              : 'Next corps member →'}
          </button>
        </div>
      </div>
    )
  }

  /* ─── Status badge helper ─── */
  function StatusBadge({ status }) {
    const map = {
      waiting: { label: 'Waiting', bg: '#EFF6FF', color: '#1D4ED8' },
      called:  { label: 'Called',  bg: '#FEF9C3', color: '#854D0E' },
      served:  { label: 'Served',  bg: '#F0FDF4', color: '#166534' },
    }
    const s = map[status] || { label: status, bg: LINE, color: MUTED }
    return (
      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
        style={{ backgroundColor: s.bg, color: s.color }}>
        {s.label}
      </span>
    )
  }

  /* ─── Main form layout ─── */
  return (
    <>
    <div className="px-4 py-4 lg:px-8 lg:py-6 max-w-2xl mx-auto lg:max-w-6xl">

      {/* ── Page title ── */}
      <div className="mb-5">
        <h1 className="text-xl font-bold" style={{ color: INK }}>Check In</h1>
        <p className="text-sm mt-0.5" style={{ color: MUTED }}>Register corps members · Eti-Osa 3 Special CDS</p>
      </div>

      {/* ── Desktop quick-stats strip ── */}
      <div className="hidden lg:grid lg:grid-cols-4 lg:gap-4 mb-6">
        {[
          { icon: Users,    label: 'Registered',  value: liveStats.total,   color: G },
          { icon: Clock,    label: 'Waiting',      value: liveStats.waiting, color: '#1D4ED8' },
          { icon: Activity, label: 'Served',        value: liveStats.served,  color: '#166534' },
          { icon: Layers,   label: 'Now Serving',  value: currentBatch > 0 ? `Wave ${currentBatch}` : '—', color: '#92400E' },
        ].map(({ icon: Icon, label, value, color }) => (
          <div key={label} className="bg-white rounded-2xl px-4 py-3 flex items-center gap-3" style={{ border: `1px solid ${LINE}` }}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: `${color}15` }}>
              <Icon className="w-4.5 h-4.5" style={{ color }} />
            </div>
            <div>
              <p className="text-xs font-medium" style={{ color: MUTED }}>{label}</p>
              <p className="text-xl font-bold leading-tight" style={{ color: INK }}>{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Two-column on desktop ── */}
      <div className="lg:grid lg:grid-cols-[1fr_1.1fr] lg:gap-6 space-y-4 lg:space-y-0">

        {/* ── LEFT: form + lookup ── */}
        <div className="space-y-4">

          {/* Register form */}
          <div className="bg-white rounded-2xl p-5" style={{ border: `1px solid ${LINE}` }}>
            <h2 className="text-xs font-bold uppercase tracking-wider mb-4" style={{ color: MUTED }}>Register corps member</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <label className="block">
                <span className="text-sm font-semibold" style={{ color: INK }}>Full name</span>
                <input
                  type="text" value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  maxLength={200} autoComplete="off" autoCapitalize="words"
                  className="mt-1.5 w-full rounded-xl px-4 py-3 text-base outline-none transition-all"
                  style={{ border: `1.5px solid ${LINE}`, color: INK, backgroundColor: '#F8FAFC' }}
                  placeholder="e.g. Adaeze Okonkwo"
                  disabled={busy}
                  onFocus={e => { e.target.style.borderColor = G; e.target.style.boxShadow = '0 0 0 3px rgba(27,107,58,0.10)' }}
                  onBlur={e =>  { e.target.style.borderColor = LINE; e.target.style.boxShadow = 'none' }}
                />
              </label>

              <label className="block">
                <span className="text-sm font-semibold" style={{ color: INK }}>State code</span>
                <div className="flex gap-2 mt-1.5">
                  <input
                    type="text" value={stateCode}
                    onChange={(e) => { setStateCode(e.target.value.toUpperCase()); setStateCodeError('') }}
                    onBlur={handleStateCodeBlur}
                    onFocus={(e) => { setStateCodeError(''); e.target.style.borderColor = stateCodeError ? '#EF4444' : G; e.target.style.boxShadow = '0 0 0 3px rgba(27,107,58,0.10)' }}
                    maxLength={20} autoComplete="off" autoCapitalize="characters"
                    className="flex-1 rounded-xl px-4 py-3 text-base font-mono tracking-wider outline-none transition-all"
                    style={{
                      border: `1.5px solid ${stateCodeError ? '#EF4444' : LINE}`,
                      color: INK, backgroundColor: '#F8FAFC',
                    }}
                    placeholder="LA/24A/1234"
                    disabled={busy}
                  />
                  <button
                    type="button"
                    onClick={startQRScan}
                    disabled={busy}
                    title="Scan QR code"
                    className="px-3 rounded-xl transition-colors active:opacity-70 disabled:opacity-40 flex-shrink-0"
                    style={{ backgroundColor: 'rgba(27,107,58,0.08)', color: G, border: `1.5px solid rgba(27,107,58,0.2)` }}
                  >
                    <ScanLine className="w-5 h-5" />
                  </button>
                </div>
                {stateCodeError && (
                  <p className="text-red-600 text-xs font-semibold mt-1">{stateCodeError}</p>
                )}
              </label>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl px-4 py-3 text-sm font-semibold">
                  {error}
                  {duplicateCode && (
                    <Link to={`/status/${encodeURIComponent(duplicateCode)}`}
                      className="block mt-1.5 underline font-bold" style={{ color: G }}>
                      View their status page →
                    </Link>
                  )}
                </div>
              )}

              <button type="submit" disabled={busy}
                className="w-full py-3.5 rounded-xl text-sm font-bold text-white transition-opacity active:opacity-80 disabled:opacity-40"
                style={{ backgroundColor: G }}>
                {busy ? 'Registering…' : 'Register & generate QR'}
              </button>
            </form>
          </div>

          {/* Lookup */}
          <div className="bg-white rounded-2xl p-5" style={{ border: `1px solid ${LINE}` }}>
            <h2 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: MUTED }}>Look up a registration</h2>
            <div className="flex gap-2">
              <input
                type="text" value={lookupCode}
                onChange={(e) => { setLookupCode(e.target.value.toUpperCase()); setLookupError(''); setLookupResult(null) }}
                maxLength={20} autoComplete="off" autoCapitalize="characters"
                className="flex-1 rounded-xl px-4 py-2.5 text-sm font-mono tracking-wider outline-none transition-all"
                style={{ border: `1.5px solid ${LINE}`, color: INK, backgroundColor: '#F8FAFC' }}
                placeholder="Enter state code"
                onFocus={e => { e.target.style.borderColor = G }}
                onBlur={e =>  { e.target.style.borderColor = LINE }}
              />
              <button onClick={handleLookup} disabled={lookupBusy || !lookupCode.trim()}
                className="px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-opacity disabled:opacity-40"
                style={{ backgroundColor: INK }}>
                {lookupBusy ? '…' : 'Search'}
              </button>
            </div>
            {lookupError && <p className="text-red-600 text-xs font-semibold mt-2">{lookupError}</p>}
            {lookupResult && (
              <div className="mt-3 rounded-xl px-4 py-3 flex items-center justify-between gap-3"
                style={{ backgroundColor: 'rgba(27,107,58,0.06)', border: `1px solid rgba(27,107,58,0.15)` }}>
                <div>
                  <p className="text-sm font-bold" style={{ color: INK }}>{lookupResult.full_name}</p>
                  <p className="text-xs font-mono mt-0.5" style={{ color: MUTED }}>
                    {lookupResult.state_code} · Q#{lookupResult.queue_number} · Wave {lookupResult.batch_number}
                  </p>
                </div>
                <Link to={`/status/${encodeURIComponent(lookupResult.state_code)}`}
                  className="text-xs font-bold underline flex-shrink-0" style={{ color: G }}>
                  Status page
                </Link>
              </div>
            )}
          </div>

          {/* Check-in QR Card — QR is for all execs; sharable link/buttons are super admin only */}
          <div className="bg-white rounded-2xl p-5" style={{ border: `1px solid ${LINE}` }}>
            <h2 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: MUTED }}>Check-in QR</h2>
            <p className="text-xs mb-4" style={{ color: MUTED }}>
              Show the QR code for corps members to scan and join the queue from their own phones.
            </p>

            {/* QR Code + Show button */}
            <div className="flex flex-col items-center gap-3">
              <div
                ref={linkQrRef}
                className="p-3 rounded-2xl inline-block"
                style={{ backgroundColor: '#fff', border: `1.5px solid ${LINE}`, boxShadow: '0 1px 6px rgba(0,0,0,0.07)' }}
              >
                <QRCodeCanvas
                  value={joinUrl}
                  size={160}
                  bgColor="#ffffff"
                  fgColor={INK}
                  level="M"
                  includeMargin={false}
                />
              </div>

              {/* Present / fullscreen button */}
              <button
                onClick={() => setShowJoinQR(true)}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-colors active:opacity-70"
                style={{ backgroundColor: G, color: '#fff' }}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V6a2 2 0 012-2h2M4 16v2a2 2 0 002 2h2m8-16h2a2 2 0 012 2v2m0 8v2a2 2 0 01-2 2h-2" />
                </svg>
                Show QR — Corps Member Scan
              </button>

              <button
                onClick={downloadQR}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors active:opacity-70"
                style={{ backgroundColor: '#F1F5F9', color: MUTED }}
              >
                <Download className="w-3.5 h-3.5" />
                Download QR
              </button>
            </div>

            {/* URL row + share buttons — super admin only (prevents execs sharing the link) */}
            {isSuperAdmin && (
            <>
            {/* URL row */}
            <div className="flex items-center gap-2 p-3 rounded-xl mt-4" style={{ backgroundColor: '#F8FAFC', border: `1px solid ${LINE}` }}>
              <Link2 className="w-4 h-4 flex-shrink-0" style={{ color: MUTED }} />
              <span className="flex-1 text-xs font-mono truncate" style={{ color: INK }}>
                {joinUrl}
              </span>
            </div>

            {/* Share buttons */}
            <div className="grid grid-cols-3 gap-2 mt-4">
              <button
                onClick={copyLink}
                className="flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl text-xs font-semibold transition-colors active:opacity-70"
                style={{ backgroundColor: linkCopied ? 'rgba(27,107,58,0.08)' : '#F1F5F9', color: linkCopied ? G : MUTED, border: `1px solid ${LINE}` }}
              >
                <Copy className="w-4 h-4" />
                {linkCopied ? 'Copied!' : 'Copy'}
              </button>

              <button
                onClick={shareWhatsApp}
                className="flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl text-xs font-semibold transition-colors active:opacity-70"
                style={{ backgroundColor: 'rgba(37,211,102,0.08)', color: '#128C7E', border: '1px solid rgba(37,211,102,0.2)' }}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                  <path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.126 1.528 5.858L.057 23.571a.5.5 0 00.612.612l5.713-1.471A11.943 11.943 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.793 9.793 0 01-5.015-1.378l-.36-.214-3.733.961.982-3.617-.235-.374A9.793 9.793 0 012.182 12C2.182 6.57 6.57 2.182 12 2.182S21.818 6.57 21.818 12 17.43 21.818 12 21.818z"/>
                </svg>
                WhatsApp
              </button>

              <button
                onClick={shareNative}
                className="flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl text-xs font-semibold transition-colors active:opacity-70"
                style={{ backgroundColor: 'rgba(27,107,58,0.08)', color: G, border: `1px solid rgba(27,107,58,0.15)` }}
              >
                <Share2 className="w-4 h-4" />
                Share
              </button>
            </div>
            </>
            )}
          </div>

          {/* Recent (mobile only – desktop has live feed on right) */}
          {recentRegs.length > 0 && (
            <div className="lg:hidden bg-white rounded-2xl p-5" style={{ border: `1px solid ${LINE}` }}>
              <h2 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: MUTED }}>Recent registrations</h2>
              <div className="divide-y" style={{ borderColor: LINE }}>
                {recentRegs.slice(0, 5).map(r => (
                  <div key={r.state_code} className="flex items-center justify-between py-2.5">
                    <div>
                      <p className="text-sm font-semibold" style={{ color: INK }}>{r.full_name}</p>
                      <p className="text-xs font-mono" style={{ color: MUTED }}>Q#{r.queue_number} · Wave {r.batch_number}</p>
                    </div>
                    <Link to={`/status/${encodeURIComponent(r.state_code)}`}
                      className="text-xs font-bold underline" style={{ color: G }}>
                      View QR
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── RIGHT: live activity feed (desktop only) ── */}
        <div className="hidden lg:block space-y-4">
          <div className="bg-white rounded-2xl p-5 h-full" style={{ border: `1px solid ${LINE}` }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-bold uppercase tracking-wider" style={{ color: MUTED }}>Live activity</h2>
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-medium" style={{ color: MUTED }}>Real-time</span>
              </span>
            </div>

            {liveRegs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Users className="w-8 h-8 mb-3" style={{ color: LINE }} />
                <p className="text-sm font-medium" style={{ color: MUTED }}>No registrations yet today</p>
                <p className="text-xs mt-1" style={{ color: MUTED }}>New check-ins will appear here instantly</p>
              </div>
            ) : (
              <div className="space-y-2 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 320px)' }}>
                {liveRegs.map(r => {
                  const isNew = newIds.has(r.id)
                  return (
                    <div key={r.id}
                      className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-300"
                      style={{
                        backgroundColor: isNew ? 'rgba(27,107,58,0.07)' : '#F8FAFC',
                        border: `1px solid ${isNew ? 'rgba(27,107,58,0.2)' : LINE}`,
                      }}>
                      {/* Queue # badge */}
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 font-bold text-sm"
                        style={{ backgroundColor: isNew ? G : '#E2E8F0', color: isNew ? 'white' : MUTED }}>
                        #{r.queue_number}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate leading-tight" style={{ color: INK }}>{r.full_name}</p>
                        <p className="text-xs font-mono mt-0.5 truncate" style={{ color: MUTED }}>
                          {r.state_code}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <StatusBadge status={r.served_at ? 'served' : 'waiting'} />
                        <span className="text-[10px]" style={{ color: MUTED }}>W{r.batch_number}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>

    {/* ── Fullscreen Join QR modal ── */}
    {showJoinQR && (
      <div
        className="fixed inset-0 z-50 flex flex-col items-center justify-center"
        style={{ backgroundColor: '#1B6B3A' }}
        onClick={() => setShowJoinQR(false)}
      >
        <div className="text-white text-center mb-6 px-4">
          <div className="text-2xl font-extrabold tracking-tight">Eti-Osa 3 Special CDS</div>
          <div className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.75)' }}>
            Scan to join the queue
          </div>
        </div>

        <div className="p-5 rounded-3xl" style={{ backgroundColor: '#fff' }}
          onClick={e => e.stopPropagation()}>
          <QRCodeCanvas
            value={joinUrl}
            size={260}
            bgColor="#ffffff"
            fgColor="#1B6B3A"
            level="H"
            includeMargin={false}
          />
        </div>

        <button
          onClick={() => setShowJoinQR(false)}
          className="mt-8 px-8 py-3 rounded-2xl font-bold text-sm"
          style={{ backgroundColor: 'rgba(255,255,255,0.15)', color: '#fff' }}
        >
          Close
        </button>
      </div>
    )}

    {/* ── QR Scanner modal (outside main div, inside fragment) ── */}
    {showQRScanner && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
        onClick={stopQRScan}
      >
        <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-2xl"
          onClick={e => e.stopPropagation()}>
          <h2 className="text-lg font-extrabold mb-1" style={{ color: INK }}>Scan State-Code QR</h2>
          <p className="text-xs mb-3" style={{ color: MUTED }}>Point camera at a corps member's status QR code to fill the state code field.</p>
          <div className="relative bg-black rounded-xl overflow-hidden" style={{ aspectRatio: '4/3' }}>
            <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
            <canvas ref={canvasRef} className="hidden" />
            <div className="absolute inset-0 border-4 border-white/30 rounded-xl pointer-events-none" />
            {qrScanning && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/60 text-white text-xs font-semibold px-3 py-1 rounded-full">
                Scanning…
              </div>
            )}
          </div>
          <button
            onClick={stopQRScan}
            className="w-full mt-3 py-2.5 rounded-xl text-sm font-semibold transition-colors"
            style={{ backgroundColor: '#F1F5F9', color: INK }}
          >
            Cancel
          </button>
        </div>
      </div>
    )}
    </>
  )
}
