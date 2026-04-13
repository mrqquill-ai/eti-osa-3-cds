import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Check,
  X,
  RotateCcw,
  Settings,
  Search,
  AlertTriangle,
  PlayCircle,
  Lock,
  Download
} from 'lucide-react'
import { supabase } from '../lib/supabase.js'

const SORTABLE = [
  { key: 'queue_number', label: 'Q#' },
  { key: 'full_name', label: 'Name' },
  { key: 'state_code', label: 'State code' },
  { key: 'batch_number', label: 'Wave' },
  { key: 'registered_at', label: 'Registered' },
  { key: 'status', label: 'Status' }
]

export default function Dashboard() {
  // ── ALL hooks declared up front (React rules of hooks) ──
  const [pinInput, setPinInput] = useState('')
  const [pinError, setPinError] = useState('')
  const [adminPin, setAdminPin] = useState(() => {
    try { return sessionStorage.getItem('admin_pin') || '' } catch { return '' }
  })
  const [unlocked, setUnlocked] = useState(() => {
    try { return sessionStorage.getItem('dashboard_unlocked') === 'yes' } catch { return false }
  })

  const [rows, setRows] = useState([])
  const [settings, setSettings] = useState(null)
  const [sortKey, setSortKey] = useState('queue_number')
  const [sortDir, setSortDir] = useState('asc')
  const [searchQuery, setSearchQuery] = useState('')
  const [showStartModal, setShowStartModal] = useState(false)
  const [pendingBatchSize, setPendingBatchSize] = useState(30)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [resetConfirmText, setResetConfirmText] = useState('')
  const [showEmptyBatchConfirm, setShowEmptyBatchConfirm] = useState(false)
  const [showVoidConfirm, setShowVoidConfirm] = useState(null)
  const [showSettingsMenu, setShowSettingsMenu] = useState(false)
  const [showChangePinModal, setShowChangePinModal] = useState(false)
  const [newPinInput, setNewPinInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [rowBusy, setRowBusy] = useState(null)
  const [toast, setToast] = useState('')
  const [error, setError] = useState('')
  const [showCallWaveConfirm, setShowCallWaveConfirm] = useState(false)
  const [tablePage, setTablePage] = useState(0)
  const TABLE_PAGE_SIZE = 100
  const settingsRef = useRef(null)
  const lastActivityRef = useRef(Date.now())

  const [timeoutWarning, setTimeoutWarning] = useState(false)
  const [pinAttempts, setPinAttempts] = useState(0)
  const [pinLockUntil, setPinLockUntil] = useState(0)
  const [showChangeBatchSize, setShowChangeBatchSize] = useState(false)
  const [newBatchSize, setNewBatchSize] = useState(30)

  // Session timeout: re-lock after 15 minutes of inactivity, warn at 13 min.
  useEffect(() => {
    if (!unlocked) return
    function resetTimer() { lastActivityRef.current = Date.now(); setTimeoutWarning(false) }
    const events = ['mousedown', 'keydown', 'touchstart', 'scroll']
    events.forEach((e) => window.addEventListener(e, resetTimer))
    const check = setInterval(() => {
      const idle = Date.now() - lastActivityRef.current
      if (idle > 15 * 60 * 1000) {
        setUnlocked(false)
        setAdminPin('')
        setTimeoutWarning(false)
        try { sessionStorage.removeItem('dashboard_unlocked'); sessionStorage.removeItem('admin_pin') } catch {}
      } else if (idle > 13 * 60 * 1000) {
        setTimeoutWarning(true)
      }
    }, 10000)
    return () => {
      events.forEach((e) => window.removeEventListener(e, resetTimer))
      clearInterval(check)
    }
  }, [unlocked])

  // Close settings menu on outside click.
  useEffect(() => {
    function handleClick(e) {
      if (settingsRef.current && !settingsRef.current.contains(e.target)) {
        setShowSettingsMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // ── Data load + realtime ──────────────────────────────
  useEffect(() => {
    if (!unlocked) return
    let cancelled = false

    async function load() {
      const [regResp, setResp] = await Promise.all([
        supabase.from('registrations').select('*').order('queue_number', { ascending: true }).limit(2000),
        supabase.from('session_settings').select('*').eq('id', 1).single()
      ])
      if (cancelled) return
      if (regResp.error) { showError(regResp.error); return }
      if (setResp.error) { showError(setResp.error); return }
      if (regResp.data) setRows(regResp.data)
      if (setResp.data) {
        setSettings(setResp.data)
        setPendingBatchSize(setResp.data.batch_size)
      }
    }
    load()

    const channel = supabase
      .channel('dashboard')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'registrations' },
        (payload) => {
          setRows((prev) => {
            if (payload.eventType === 'INSERT') {
              if (prev.some((r) => r.id === payload.new.id)) return prev
              return [...prev, payload.new]
            }
            if (payload.eventType === 'UPDATE') {
              return prev.map((r) => (r.id === payload.new.id ? payload.new : r))
            }
            if (payload.eventType === 'DELETE') {
              return prev.filter((r) => r.id !== payload.old.id)
            }
            return prev
          })
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'session_settings', filter: 'id=eq.1' },
        (payload) => setSettings(payload.new)
      )
      .subscribe()

    return () => { cancelled = true; supabase.removeChannel(channel) }
  }, [unlocked])

  // ── Helpers ───────────────────────────────────────────
  function flash(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  function showError(e) {
    const raw = (e && e.message) || String(e || 'Unknown error')
    let friendly = raw
    if (raw.includes('invalid_admin_pin')) {
      friendly = 'Invalid PIN. Your session may have expired. Please refresh and log in again.'
      // Force re-lock
      setUnlocked(false)
      setAdminPin('')
      try { sessionStorage.removeItem('dashboard_unlocked'); sessionStorage.removeItem('admin_pin') } catch {}
    } else if (raw.includes('register_corps_member') || raw.includes('reset_day') || raw.includes('function')) {
      friendly = 'Database not set up yet. Open the Supabase SQL editor and run the migration files, then reload this page.'
    } else if (raw.includes('relation') && raw.includes('does not exist')) {
      friendly = 'Database tables are missing. Run the migration SQL in the Supabase SQL editor, then reload this page.'
    } else if (raw.toLowerCase().includes('failed to fetch') || raw.toLowerCase().includes('networkerror')) {
      friendly = 'Cannot reach Supabase. Check the internet connection.'
    } else if (raw.includes('JWT') || raw.includes('Invalid API key') || raw.includes('Unauthorized')) {
      friendly = 'Supabase rejected the API key. Double-check VITE_SUPABASE_ANON_KEY in Vercel/.env.local.'
    }
    setError(friendly)
    console.error('[dashboard]', e)
  }

  // ── Derived data ──────────────────────────────────────
  const counts = useMemo(() => {
    let registered = 0, waiting = 0, served = 0
    for (const r of rows) {
      if (r.voided) continue
      registered += 1
      if (r.served_at) served += 1
      else waiting += 1
    }
    return { registered, waiting, served }
  }, [rows])

  const nextBatchNumber = (settings?.current_batch ?? 0) + 1
  const nextBatchCount = useMemo(() => {
    return rows.filter(
      (r) => !r.voided && !r.served_at && r.batch_number === nextBatchNumber
    ).length
  }, [rows, nextBatchNumber])

  const sessionActive = settings && (settings.current_batch > 0 || counts.registered > 0)

  // Current wave progress
  const currentWaveProgress = useMemo(() => {
    if (!settings || settings.current_batch <= 0) return null
    const waveRows = rows.filter(r => !r.voided && r.batch_number === settings.current_batch)
    const served = waveRows.filter(r => !!r.served_at).length
    return { served, total: waveRows.length }
  }, [rows, settings])

  const filteredAndSortedRows = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    let list = rows
    if (q) {
      list = rows.filter(
        (r) =>
          r.full_name.toLowerCase().includes(q) ||
          r.state_code.toLowerCase().includes(q)
      )
    }

    const dir = sortDir === 'asc' ? 1 : -1
    const key = sortKey
    const get = (r) => {
      if (key === 'status') {
        if (r.voided) return 3
        if (r.served_at) return 2
        return 1
      }
      return r[key]
    }
    return [...list].sort((a, b) => {
      const va = get(a)
      const vb = get(b)
      if (va == null) return 1
      if (vb == null) return -1
      if (va < vb) return -1 * dir
      if (va > vb) return 1 * dir
      return 0
    })
  }, [rows, searchQuery, sortKey, sortDir])

  function toggleSort(key) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('asc') }
  }

  // ── Actions (all use server-side PIN validation) ──────
  async function handlePinSubmit(e) {
    e.preventDefault()
    const trimmed = pinInput.trim()
    if (!trimmed) return

    // Brute-force protection: lock after 5 failed attempts for 60 seconds
    if (pinLockUntil > Date.now()) {
      const secsLeft = Math.ceil((pinLockUntil - Date.now()) / 1000)
      setPinError(`Too many attempts. Try again in ${secsLeft} seconds.`)
      return
    }

    setBusy(true)
    setPinError('')
    try {
      const { data, error: rpcError } = await supabase.rpc('verify_admin_pin', { p_pin: trimmed })
      if (rpcError) throw rpcError
      if (data) {
        setAdminPin(trimmed)
        setUnlocked(true)
        setPinAttempts(0)
        try {
          sessionStorage.setItem('dashboard_unlocked', 'yes')
          sessionStorage.setItem('admin_pin', trimmed)
        } catch {}
      } else {
        const attempts = pinAttempts + 1
        setPinAttempts(attempts)
        if (attempts >= 5) {
          const lockTime = Date.now() + 60000 * Math.min(attempts - 4, 5) // 1-5 min escalating
          setPinLockUntil(lockTime)
          setPinError(`Too many wrong attempts. Locked for ${Math.ceil((lockTime - Date.now()) / 60000)} minute(s).`)
        } else {
          setPinError(`Wrong PIN. ${5 - attempts} attempt(s) remaining.`)
        }
        setPinInput('')
      }
    } catch (err) {
      const msg = (err && err.message) || ''
      if (msg.toLowerCase().includes('failed to fetch')) {
        setPinError('No internet connection. Try again.')
      } else if (msg.includes('verify_admin_pin') || msg.includes('does not exist')) {
        setPinError('Security update needed. Ask the admin to run the latest SQL migration.')
      } else {
        setPinError('Could not verify PIN. Try again.')
      }
    } finally {
      setBusy(false)
    }
  }

  async function startSession() {
    setBusy(true); setError('')
    try {
      const { error: e } = await supabase.rpc('admin_reset_day', { p_pin: adminPin, p_batch_size: pendingBatchSize })
      if (e) throw e
      flash('New session started.')
      setShowStartModal(false)
    } catch (e) { showError(e) } finally { setBusy(false) }
  }

  async function callNextBatch() {
    if (!settings) return
    setBusy(true); setError('')
    try {
      const { data, error: e } = await supabase.rpc('admin_call_next_batch', { p_pin: adminPin })
      if (e) throw e
      flash(`Now calling wave ${data}.`)
    } catch (e) { showError(e) } finally { setBusy(false) }
  }

  function handleCallNextBatch() {
    if (nextBatchCount === 0) {
      setShowEmptyBatchConfirm(true)
    } else {
      setShowCallWaveConfirm(true)
    }
  }

  function exportCSV() {
    const headers = ['Queue #', 'Full Name', 'State Code', 'Wave', 'Registered At', 'Served At', 'Voided']
    const csvRows = [headers.join(',')]
    for (const r of rows) {
      csvRows.push([
        r.queue_number,
        `"${r.full_name.replace(/"/g, '""')}"`,
        r.state_code,
        r.batch_number,
        new Date(r.registered_at).toLocaleString('en-NG'),
        r.served_at ? new Date(r.served_at).toLocaleString('en-NG') : '',
        r.voided ? 'Yes' : ''
      ].join(','))
    }
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `clearance-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    flash('CSV downloaded.')
  }

  async function goBackBatch() {
    if (!settings || settings.current_batch <= 0) return
    setBusy(true); setError('')
    try {
      const { data, error: e } = await supabase.rpc('admin_go_back_batch', { p_pin: adminPin })
      if (e) throw e
      flash(data === 0 ? 'Went back - no wave serving now.' : `Went back to wave ${data}.`)
    } catch (e) { showError(e) } finally { setBusy(false) }
  }

  async function toggleRegistration() {
    if (!settings) return
    setBusy(true); setError('')
    try {
      const { data, error: e } = await supabase.rpc('admin_toggle_registration', { p_pin: adminPin })
      if (e) throw e
      flash(data ? 'Registration reopened.' : 'Registration closed.')
      setShowSettingsMenu(false)
    } catch (e) { showError(e) } finally { setBusy(false) }
  }

  async function toggleServed(row) {
    setRowBusy(row.id); setError('')
    try {
      const { error: e } = await supabase.rpc('admin_toggle_served', { p_pin: adminPin, p_registration_id: row.id })
      if (e) throw e
      flash(row.served_at ? `Unmarked ${row.full_name} as served.` : `Marked ${row.full_name} as served.`)
    } catch (e) { showError(e) } finally { setRowBusy(null) }
  }

  async function toggleVoid(row) {
    setRowBusy(row.id); setError('')
    try {
      const { error: e } = await supabase.rpc('admin_toggle_void', { p_pin: adminPin, p_registration_id: row.id })
      if (e) throw e
      flash(row.voided ? `Restored ${row.full_name}.` : `Voided ${row.full_name}.`)
      setShowVoidConfirm(null)
    } catch (e) { showError(e) } finally { setRowBusy(null) }
  }

  const [showDaySummary, setShowDaySummary] = useState(null)

  async function resetDay() {
    // Capture summary before reset
    const summary = { registered: counts.registered, served: counts.served, waiting: counts.waiting, waves: settings?.current_batch || 0 }
    setBusy(true); setError('')
    try {
      const { error: e } = await supabase.rpc('admin_reset_day', { p_pin: adminPin, p_batch_size: settings?.batch_size ?? 30 })
      if (e) throw e
      setShowResetConfirm(false)
      setResetConfirmText('')
      setShowDaySummary(summary)
    } catch (e) { showError(e) } finally { setBusy(false) }
  }

  async function changeBatchSize() {
    if (newBatchSize < 10 || newBatchSize > 100) {
      setError('Wave size must be between 10 and 100.')
      return
    }
    setBusy(true); setError('')
    try {
      const { error: e } = await supabase.from('session_settings').update({ batch_size: newBatchSize }).eq('id', 1)
      if (e) throw e
      flash(`Wave size changed to ${newBatchSize}. Applies to new registrations.`)
      setShowChangeBatchSize(false)
    } catch (e) { showError(e) } finally { setBusy(false) }
  }

  async function changePin() {
    if (newPinInput.length < 4) {
      setError('New PIN must be at least 4 characters.')
      return
    }
    setBusy(true); setError('')
    try {
      const { error: e } = await supabase.rpc('admin_change_pin', { p_current_pin: adminPin, p_new_pin: newPinInput })
      if (e) throw e
      setAdminPin(newPinInput)
      try { sessionStorage.setItem('admin_pin', newPinInput) } catch {}
      setShowChangePinModal(false)
      setNewPinInput('')
      flash('PIN changed successfully.')
    } catch (e) { showError(e) } finally { setBusy(false) }
  }

  function formatTime(ts) {
    return new Date(ts).toLocaleTimeString('en-NG', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    })
  }

  // ── PIN screen ────────────────────────────────────────
  if (!unlocked) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-8 max-w-xs w-full text-center">
          <div className="flex justify-center mb-4">
            <div className="bg-emerald-100 rounded-full p-3">
              <Lock className="w-8 h-8 text-emerald-800" />
            </div>
          </div>
          <h1 className="text-xl font-extrabold text-slate-950">Dashboard locked</h1>
          <p className="text-sm text-slate-600 mt-1">Enter the executive PIN to continue.</p>
          <form onSubmit={handlePinSubmit} className="mt-5">
            <input
              type="password"
              inputMode="numeric"
              value={pinInput}
              onChange={(e) => { setPinInput(e.target.value); setPinError('') }}
              placeholder="Enter PIN"
              autoFocus
              className="w-full text-center text-2xl tracking-[0.3em] font-bold rounded-lg border-2 border-slate-300 focus:border-emerald-700 focus:outline-none px-3 py-3"
            />
            {pinError && (
              <div className="text-red-700 text-sm font-semibold mt-2">{pinError}</div>
            )}
            <button
              type="submit"
              disabled={!pinInput || busy}
              className="w-full mt-4 bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 disabled:bg-slate-300 text-white font-bold py-3 rounded-xl text-base transition-colors"
            >
              {busy ? 'Verifying...' : 'Unlock'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  // ── Main dashboard ────────────────────────────────────
  return (
    <div className="max-w-5xl mx-auto p-3 sm:p-5 flex flex-col" style={{ height: 'calc(100vh - 40px)' }}>
      {/* Error banner */}
      {error && (
        <div className="mb-3 bg-red-100 border-2 border-red-500 text-red-950 rounded-xl p-3 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <div className="font-extrabold text-sm">Something went wrong</div>
            <div className="text-sm mt-0.5 whitespace-pre-wrap">{error}</div>
          </div>
          <button onClick={() => setError('')} className="text-red-900 font-bold text-lg leading-none px-1" aria-label="Dismiss">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Timeout warning */}
      {timeoutWarning && (
        <div className="mb-3 bg-amber-100 border-2 border-amber-400 text-amber-900 rounded-xl p-3 text-sm font-semibold flex items-center gap-2 animate-pulse">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          Session will lock in ~2 minutes due to inactivity. Tap anywhere to stay logged in.
        </div>
      )}

      {/* Default PIN warning */}
      {adminPin === '2025' && (
        <div className="mb-3 bg-amber-100 border-2 border-amber-400 text-amber-900 rounded-xl p-3 text-sm font-semibold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          You are using the default PIN. Change it under Settings &gt; Change PIN.
        </div>
      )}

      {/* ── Top bar: title + settings overflow ── */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <h1 className="text-xl font-extrabold text-slate-950">Dashboard</h1>
          <p className="text-xs text-slate-600 font-medium">Eti-Osa 3 Special CDS</p>
        </div>
        <div className="flex items-center gap-2">
          {!sessionActive && (
            <button
              onClick={() => setShowStartModal(true)}
              className="flex items-center gap-1.5 bg-emerald-800 hover:bg-emerald-900 active:bg-emerald-950 text-white font-bold px-3 py-2 rounded-lg text-sm transition-colors"
            >
              <PlayCircle className="w-4 h-4" />
              Start session
            </button>
          )}

          <div className="relative" ref={settingsRef}>
            <button
              onClick={() => setShowSettingsMenu((p) => !p)}
              className="p-2 rounded-lg hover:bg-slate-200 active:bg-slate-300 text-slate-700 transition-colors"
              aria-label="Settings"
            >
              <Settings className="w-5 h-5" />
            </button>
            {showSettingsMenu && (
              <div className="absolute right-0 mt-1 w-52 bg-white rounded-xl shadow-xl border border-slate-200 py-1 z-40">
                <button
                  onClick={toggleRegistration}
                  disabled={busy || !settings}
                  className="w-full text-left px-4 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-100 disabled:text-slate-400 disabled:hover:bg-white transition-colors"
                >
                  {settings?.registration_open ? 'Close registration' : 'Open registration'}
                </button>
                <button
                  onClick={() => { setShowStartModal(true); setShowSettingsMenu(false) }}
                  className="w-full text-left px-4 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-100 transition-colors"
                >
                  Start new session
                </button>
                <button
                  onClick={() => { setShowChangeBatchSize(true); setNewBatchSize(settings?.batch_size ?? 30); setShowSettingsMenu(false) }}
                  disabled={!settings}
                  className="w-full text-left px-4 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-100 disabled:text-slate-400 transition-colors"
                >
                  Change wave size
                </button>
                <button
                  onClick={() => { setShowChangePinModal(true); setShowSettingsMenu(false) }}
                  className="w-full text-left px-4 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-100 transition-colors"
                >
                  Change PIN
                </button>
                <button
                  onClick={() => { exportCSV(); setShowSettingsMenu(false) }}
                  disabled={rows.length === 0}
                  className="w-full text-left px-4 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-100 disabled:text-slate-400 transition-colors flex items-center gap-2"
                >
                  <Download className="w-3.5 h-3.5" /> Export CSV
                </button>
                <hr className="my-1 border-slate-200" />
                <button
                  onClick={() => { setShowResetConfirm(true); setShowSettingsMenu(false) }}
                  className="w-full text-left px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50 transition-colors"
                >
                  Reset day
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Config strip ── */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold text-slate-700 mb-3 px-1">
        <span>Wave size: <span className="text-slate-950">{settings?.batch_size ?? '-'}</span></span>
        <span className="text-slate-300">|</span>
        <span>
          Registration:{' '}
          {settings?.registration_open ? (
            <span className="text-emerald-700">Open</span>
          ) : (
            <span className="text-red-700">Closed</span>
          )}
        </span>
      </div>

      {/* ── Hero: Call next wave + Go back ── */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          onClick={handleCallNextBatch}
          disabled={busy || !settings}
          title={nextBatchCount === 0 ? 'No corps members in the next wave yet' : `Call wave ${nextBatchNumber} (${nextBatchCount} corps members)`}
          className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-extrabold px-8 py-4 rounded-xl text-lg shadow-lg shadow-emerald-900/20 transition-colors"
        >
          <ChevronRight className="w-6 h-6" />
          Call next wave
          {settings?.current_batch > 0 && (
            <span className="ml-1 bg-white/20 rounded-md px-2 py-0.5 text-sm font-bold">
              &rarr; {nextBatchNumber}
            </span>
          )}
        </button>
        {settings?.current_batch > 0 && (
          <button
            onClick={goBackBatch}
            disabled={busy}
            title={`Go back to wave ${(settings?.current_batch ?? 1) - 1}`}
            className="flex items-center gap-1.5 bg-slate-200 hover:bg-slate-300 active:bg-slate-400 disabled:bg-slate-100 disabled:cursor-not-allowed text-slate-800 font-bold px-4 py-4 rounded-xl text-sm transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
            Go back
          </button>
        )}
      </div>
      <div className="mb-4 -mt-2">
        {nextBatchCount === 0 && settings?.current_batch >= 0 && (
          <p className="text-xs text-slate-500 pl-1">No corps members in wave {nextBatchNumber} yet.</p>
        )}
      </div>

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <Stat
          label="Now serving"
          value={settings?.current_batch ? `Wave ${settings.current_batch}` : 'None'}
          subtitle={currentWaveProgress ? `${currentWaveProgress.served}/${currentWaveProgress.total} served` : null}
          accent
        />
        <Stat label="Registered" value={counts.registered} />
        <Stat label="Waiting" value={counts.waiting} />
        <Stat label="Served" value={counts.served} />
      </div>

      {/* ── Search bar ── */}
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => { setSearchQuery(e.target.value); setTablePage(0) }}
          placeholder="Search by name or state code..."
          className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border-2 border-slate-300 focus:border-emerald-700 focus:outline-none bg-white text-slate-950 placeholder-slate-500"
        />
      </div>

      {/* ── Table ── */}
      <div className="flex-1 min-h-0 bg-white rounded-xl shadow border border-slate-200 overflow-hidden flex flex-col">
        <div className="overflow-auto flex-1">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-200 text-slate-950 sticky top-0 z-10">
              <tr>
                {SORTABLE.map((c) => (
                  <th
                    key={c.key}
                    onClick={() => toggleSort(c.key)}
                    className="px-3 py-2.5 text-left font-extrabold cursor-pointer select-none whitespace-nowrap text-xs uppercase tracking-wide"
                  >
                    {c.label}{' '}
                    {sortKey === c.key && (
                      <span className="text-emerald-700">{sortDir === 'asc' ? '\u25B2' : '\u25BC'}</span>
                    )}
                  </th>
                ))}
                <th className="px-3 py-2.5 text-left font-extrabold text-xs uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredAndSortedRows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-slate-500 font-medium">
                    {searchQuery ? 'No matches found.' : 'No registrations yet.'}
                  </td>
                </tr>
              )}
              {filteredAndSortedRows.slice(tablePage * TABLE_PAGE_SIZE, (tablePage + 1) * TABLE_PAGE_SIZE).map((r, i) => (
                <tr
                  key={r.id}
                  className={`border-t border-slate-100 transition-colors ${
                    r.voided ? 'opacity-40' : ''
                  } ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50'} ${
                    !r.voided && !r.served_at ? 'hover:bg-emerald-50' : ''
                  }`}
                >
                  <td className="px-3 py-2 font-extrabold text-slate-950">{r.queue_number}</td>
                  <td className="px-3 py-2 font-semibold text-slate-950">{r.full_name}</td>
                  <td className="px-3 py-2 font-mono text-slate-800">{r.state_code}</td>
                  <td className="px-3 py-2 text-slate-950">{r.batch_number}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-slate-800">
                    {formatTime(r.registered_at)}
                  </td>
                  <td className="px-3 py-2">
                    {r.voided ? (
                      <span className="font-bold text-red-800">Voided</span>
                    ) : r.served_at ? (
                      <span className="inline-flex items-center gap-1 font-bold text-emerald-800">
                        <Check className="w-3.5 h-3.5" /> Served
                      </span>
                    ) : (
                      <span className="font-bold text-slate-700">Waiting</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => toggleServed(r)}
                        disabled={rowBusy === r.id || r.voided}
                        className={`text-xs font-bold px-2.5 py-1.5 rounded transition-colors ${
                          r.served_at
                            ? 'bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white'
                            : 'bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 text-white'
                        } disabled:bg-slate-300 disabled:cursor-not-allowed`}
                      >
                        {rowBusy === r.id ? '...' : r.served_at ? 'Undo served' : 'Mark served'}
                      </button>
                      <button
                        onClick={() => r.voided ? toggleVoid(r) : setShowVoidConfirm(r)}
                        disabled={rowBusy === r.id}
                        aria-label={r.voided ? `Restore ${r.full_name}` : `Void ${r.full_name}`}
                        title={r.voided ? `Restore ${r.full_name}` : `Void ${r.full_name}`}
                        className={`p-1.5 rounded transition-colors ${
                          r.voided
                            ? 'text-amber-600 hover:text-amber-800 hover:bg-amber-100 active:bg-amber-200'
                            : 'text-slate-400 hover:text-red-700 hover:bg-red-100 active:bg-red-200'
                        } disabled:opacity-30 disabled:cursor-not-allowed`}
                      >
                        {r.voided ? <RotateCcw className="w-4 h-4" /> : <X className="w-4 h-4" />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredAndSortedRows.length > 0 && (
          <div className="px-3 py-1.5 border-t border-slate-200 text-xs text-slate-600 bg-slate-50 font-medium flex-shrink-0 flex items-center justify-between">
            <span>
              {searchQuery
                ? `${filteredAndSortedRows.length} of ${rows.length} entries`
                : `${rows.length} entries total`}
            </span>
            {filteredAndSortedRows.length > TABLE_PAGE_SIZE && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setTablePage(p => Math.max(0, p - 1))}
                  disabled={tablePage === 0}
                  className="px-2 py-0.5 rounded bg-slate-200 hover:bg-slate-300 disabled:opacity-40 font-bold"
                  aria-label="Previous page"
                >
                  {'\u2190'}
                </button>
                <span className="px-1">{tablePage + 1}/{Math.ceil(filteredAndSortedRows.length / TABLE_PAGE_SIZE)}</span>
                <button
                  onClick={() => setTablePage(p => Math.min(Math.ceil(filteredAndSortedRows.length / TABLE_PAGE_SIZE) - 1, p + 1))}
                  disabled={(tablePage + 1) * TABLE_PAGE_SIZE >= filteredAndSortedRows.length}
                  className="px-2 py-0.5 rounded bg-slate-200 hover:bg-slate-300 disabled:opacity-40 font-bold"
                  aria-label="Next page"
                >
                  {'\u2192'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Toast ── */}
      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-slate-950 text-white px-4 py-2 rounded-lg shadow-lg text-sm font-semibold z-50">
          {toast}
        </div>
      )}

      {/* ── Modals ── */}
      {showStartModal && (
        <Modal onClose={() => setShowStartModal(false)}>
          <h2 className="text-lg font-extrabold text-slate-950">Start a new session</h2>
          <p className="text-slate-700 text-sm mt-1">
            This archives all current entries and starts fresh.
          </p>
          <label className="block mt-4">
            <span className="text-sm font-bold text-slate-900">Wave size (20-50)</span>
            <input
              type="number"
              min={20}
              max={50}
              value={pendingBatchSize}
              onChange={(e) => setPendingBatchSize(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border-2 border-slate-300 focus:border-emerald-700 focus:outline-none px-3 py-2.5 text-lg text-slate-950"
            />
          </label>
          <div className="mt-5 flex gap-2 justify-end">
            <button
              onClick={() => setShowStartModal(false)}
              className="px-4 py-2 rounded-lg bg-slate-200 hover:bg-slate-300 active:bg-slate-400 font-semibold text-slate-900 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={startSession}
              disabled={busy || pendingBatchSize < 20 || pendingBatchSize > 50}
              className="px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 disabled:bg-slate-400 text-white font-bold transition-colors"
            >
              Start session
            </button>
          </div>
        </Modal>
      )}

      {showResetConfirm && (
        <Modal onClose={() => { setShowResetConfirm(false); setResetConfirmText('') }}>
          <h2 className="text-lg font-extrabold text-slate-950">Reset day?</h2>
          <p className="text-slate-800 text-sm mt-2">
            This will archive all of today's {counts.registered} entries. The queue restarts at 1. This cannot be undone.
          </p>
          <label className="block mt-4">
            <span className="text-sm font-bold text-slate-900">Type <span className="font-mono bg-slate-200 px-1.5 py-0.5 rounded">RESET</span> to confirm</span>
            <input
              type="text"
              value={resetConfirmText}
              onChange={(e) => setResetConfirmText(e.target.value.toUpperCase())}
              autoComplete="off"
              className="mt-1 w-full rounded-lg border-2 border-slate-300 focus:border-red-600 focus:outline-none px-3 py-2.5 text-lg font-mono tracking-wider text-slate-950"
              placeholder="RESET"
            />
          </label>
          <div className="mt-5 flex gap-2 justify-end">
            <button
              onClick={() => { setShowResetConfirm(false); setResetConfirmText('') }}
              className="px-4 py-2 rounded-lg bg-slate-200 hover:bg-slate-300 active:bg-slate-400 font-semibold text-slate-900 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={resetDay}
              disabled={busy || resetConfirmText !== 'RESET'}
              className="px-4 py-2 rounded-lg bg-red-700 hover:bg-red-800 active:bg-red-900 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold transition-colors"
            >
              Yes, reset everything
            </button>
          </div>
        </Modal>
      )}

      {showCallWaveConfirm && (
        <Modal onClose={() => setShowCallWaveConfirm(false)}>
          <h2 className="text-lg font-extrabold text-slate-950">Call Wave {nextBatchNumber}?</h2>
          <p className="text-slate-800 text-sm mt-2">
            This will notify {nextBatchCount} corps member{nextBatchCount !== 1 ? 's' : ''} in Wave {nextBatchNumber} that their wave is being served.
          </p>
          <div className="mt-5 flex gap-2 justify-end">
            <button
              onClick={() => setShowCallWaveConfirm(false)}
              className="px-4 py-2 rounded-lg bg-slate-200 hover:bg-slate-300 active:bg-slate-400 font-semibold text-slate-900 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => { setShowCallWaveConfirm(false); callNextBatch() }}
              disabled={busy}
              className="px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 disabled:bg-slate-300 text-white font-bold transition-colors"
            >
              Call wave
            </button>
          </div>
        </Modal>
      )}

      {showEmptyBatchConfirm && (
        <Modal onClose={() => setShowEmptyBatchConfirm(false)}>
          <h2 className="text-lg font-extrabold text-slate-950">Empty wave</h2>
          <p className="text-slate-800 text-sm mt-2">
            Wave {nextBatchNumber} has no registrants. Skip to Wave {nextBatchNumber} anyway?
          </p>
          <div className="mt-5 flex gap-2 justify-end">
            <button
              onClick={() => setShowEmptyBatchConfirm(false)}
              className="px-4 py-2 rounded-lg bg-slate-200 hover:bg-slate-300 active:bg-slate-400 font-semibold text-slate-900 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => { setShowEmptyBatchConfirm(false); callNextBatch() }}
              disabled={busy}
              className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 active:bg-amber-800 disabled:bg-slate-300 text-white font-bold transition-colors"
            >
              Skip anyway
            </button>
          </div>
        </Modal>
      )}

      {showVoidConfirm && (
        <Modal onClose={() => setShowVoidConfirm(null)}>
          <h2 className="text-lg font-extrabold text-slate-950">Void entry?</h2>
          <p className="text-slate-800 text-sm mt-2">
            Void entry for <strong>{showVoidConfirm.full_name}</strong> (state code <strong className="font-mono">{showVoidConfirm.state_code}</strong>)?
            This will remove them from the active queue. You can restore them later.
          </p>
          <div className="mt-5 flex gap-2 justify-end">
            <button
              onClick={() => setShowVoidConfirm(null)}
              className="px-4 py-2 rounded-lg bg-slate-200 hover:bg-slate-300 active:bg-slate-400 font-semibold text-slate-900 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => toggleVoid(showVoidConfirm)}
              disabled={busy}
              className="px-4 py-2 rounded-lg bg-red-700 hover:bg-red-800 active:bg-red-900 disabled:bg-slate-300 text-white font-bold transition-colors"
            >
              Void entry
            </button>
          </div>
        </Modal>
      )}

      {showDaySummary && (
        <Modal onClose={() => setShowDaySummary(null)}>
          <h2 className="text-lg font-extrabold text-slate-950">{'\u2705'} Day reset complete</h2>
          <p className="text-slate-700 text-sm mt-2">All entries have been archived. Here is today's summary:</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="bg-slate-50 rounded-lg p-3 text-center">
              <div className="text-xs uppercase text-slate-600 font-bold">Registered</div>
              <div className="text-2xl font-extrabold text-slate-900">{showDaySummary.registered}</div>
            </div>
            <div className="bg-emerald-50 rounded-lg p-3 text-center">
              <div className="text-xs uppercase text-emerald-700 font-bold">Served</div>
              <div className="text-2xl font-extrabold text-emerald-900">{showDaySummary.served}</div>
            </div>
            <div className="bg-amber-50 rounded-lg p-3 text-center">
              <div className="text-xs uppercase text-amber-700 font-bold">Still waiting</div>
              <div className="text-2xl font-extrabold text-amber-900">{showDaySummary.waiting}</div>
            </div>
            <div className="bg-slate-50 rounded-lg p-3 text-center">
              <div className="text-xs uppercase text-slate-600 font-bold">Waves called</div>
              <div className="text-2xl font-extrabold text-slate-900">{showDaySummary.waves}</div>
            </div>
          </div>
          <button
            onClick={() => setShowDaySummary(null)}
            className="w-full mt-5 px-4 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold transition-colors"
          >
            Done
          </button>
        </Modal>
      )}

      {showChangeBatchSize && (
        <Modal onClose={() => setShowChangeBatchSize(false)}>
          <h2 className="text-lg font-extrabold text-slate-950">Change wave size</h2>
          <p className="text-slate-700 text-sm mt-1">
            New size applies to future registrations only. Already-assigned wave numbers stay the same.
          </p>
          <label className="block mt-4">
            <span className="text-sm font-bold text-slate-900">Wave size (10-100)</span>
            <input
              type="number"
              min={10}
              max={100}
              value={newBatchSize}
              onChange={(e) => setNewBatchSize(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border-2 border-slate-300 focus:border-emerald-700 focus:outline-none px-3 py-2.5 text-lg text-slate-950"
            />
          </label>
          <div className="mt-5 flex gap-2 justify-end">
            <button onClick={() => setShowChangeBatchSize(false)} className="px-4 py-2 rounded-lg bg-slate-200 hover:bg-slate-300 font-semibold text-slate-900 transition-colors">Cancel</button>
            <button onClick={changeBatchSize} disabled={busy || newBatchSize < 10 || newBatchSize > 100} className="px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-400 text-white font-bold transition-colors">Save</button>
          </div>
        </Modal>
      )}

      {showChangePinModal && (
        <Modal onClose={() => { setShowChangePinModal(false); setNewPinInput('') }}>
          <h2 className="text-lg font-extrabold text-slate-950">Change PIN</h2>
          <p className="text-slate-700 text-sm mt-1">
            Enter a new PIN (at least 4 characters).
          </p>
          <input
            type="password"
            value={newPinInput}
            onChange={(e) => setNewPinInput(e.target.value)}
            placeholder="New PIN"
            autoFocus
            className="mt-3 w-full text-center text-2xl tracking-[0.3em] font-bold rounded-lg border-2 border-slate-300 focus:border-emerald-700 focus:outline-none px-3 py-3"
          />
          <div className="mt-5 flex gap-2 justify-end">
            <button
              onClick={() => { setShowChangePinModal(false); setNewPinInput('') }}
              className="px-4 py-2 rounded-lg bg-slate-200 hover:bg-slate-300 active:bg-slate-400 font-semibold text-slate-900 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={changePin}
              disabled={busy || newPinInput.length < 4}
              className="px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 disabled:bg-slate-400 text-white font-bold transition-colors"
            >
              Save new PIN
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── Stat card ─────────────────────────────────────────────
function Stat({ label, value, subtitle, accent }) {
  return (
    <div className={`rounded-xl p-3 border-2 ${
      accent
        ? 'bg-amber-100 border-amber-400 text-amber-950'
        : 'bg-slate-50 border-slate-200 text-slate-950'
    }`}>
      <div className={`text-[11px] uppercase font-extrabold tracking-wide ${
        accent ? 'text-amber-800' : 'text-slate-600'
      }`}>{label}</div>
      <div className="text-2xl font-extrabold leading-tight mt-0.5">{value}</div>
      {subtitle && <div className={`text-xs font-semibold mt-0.5 ${accent ? 'text-amber-700' : 'text-slate-500'}`}>{subtitle}</div>}
    </div>
  )
}

// ── Modal shell ───────────────────────────────────────────
function Modal({ children, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}
