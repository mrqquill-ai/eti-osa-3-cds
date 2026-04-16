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
  Download,
  Shield,
  Plus,
  Pencil,
  Trash2,
  LockKeyhole,
  Unlock
} from 'lucide-react'
import jsQR from 'jsqr'
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
  const [role, setRole] = useState(() => {
    try { return sessionStorage.getItem('admin_role') || 'executive' } catch { return 'executive' }
  })
  const isSuperAdmin = role === 'super_admin'

  // Super admin modals
  const [showAddRegModal, setShowAddRegModal] = useState(false)
  const [addRegName, setAddRegName] = useState('')
  const [addRegCode, setAddRegCode] = useState('')
  const [showEditModal, setShowEditModal] = useState(null)
  const [editName, setEditName] = useState('')
  const [editCode, setEditCode] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null)
  const [showSuperPinModal, setShowSuperPinModal] = useState(false)
  const [newSuperPin, setNewSuperPin] = useState('')
  const [pinLocked, setPinLocked] = useState(false)
  const [showForceExecPinModal, setShowForceExecPinModal] = useState(false)
  const [forceExecPin, setForceExecPin] = useState('')

  // Super admin panel
  const [superTab, setSuperTab] = useState(null) // null=collapsed, 'log','stats','announce','sessions','archives','duplicates'
  const [activityLog, setActivityLog] = useState([])
  const [logLoading, setLogLoading] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const [execSessions, setExecSessions] = useState([])
  const [archiveDates, setArchiveDates] = useState([])
  const [archiveRows, setArchiveRows] = useState([])
  const [archiveDate, setArchiveDate] = useState(null)
  const [duplicates, setDuplicates] = useState([])
  const [showMoveWaveModal, setShowMoveWaveModal] = useState(null)
  const [targetWave, setTargetWave] = useState(1)
  const [showNoteModal, setShowNoteModal] = useState(null)
  const [noteText, setNoteText] = useState('')
  const [showSwapModal, setShowSwapModal] = useState(null)
  const [swapTargetCode, setSwapTargetCode] = useState('')
  const [selectedRows, setSelectedRows] = useState(new Set())
  const [darkMode, setDarkMode] = useState(() => {
    try { return localStorage.getItem('dashboard_dark') === 'yes' } catch { return false }
  })
  const [soundEnabled, setSoundEnabled] = useState(false)
  const [showQRScanner, setShowQRScanner] = useState(false)
  const [qrScanning, setQrScanning] = useState(false)
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const scanIntervalRef = useRef(null)
  const prevRegisteredRef = useRef(0)

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
        setRole('executive')
        setTimeoutWarning(false)
        try { sessionStorage.removeItem('dashboard_unlocked'); sessionStorage.removeItem('admin_pin'); sessionStorage.removeItem('admin_role') } catch {}
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
      setRole('executive')
      try { sessionStorage.removeItem('dashboard_unlocked'); sessionStorage.removeItem('admin_pin'); sessionStorage.removeItem('admin_role') } catch {}
    } else if (raw.includes('dashboard_frozen')) {
      friendly = 'Dashboard is temporarily frozen by the super admin. Please wait.'
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
      // Try the new verify_login first (returns role), fall back to verify_admin_pin
      let detectedRole = null
      const { data: roleData, error: roleErr } = await supabase.rpc('verify_login', { p_pin: trimmed })
      if (!roleErr && roleData) {
        detectedRole = roleData
      } else {
        // Fallback if migration not yet run
        const { data: legacyData, error: legacyErr } = await supabase.rpc('verify_admin_pin', { p_pin: trimmed })
        if (legacyErr) throw legacyErr
        if (legacyData) detectedRole = 'executive'
      }

      if (detectedRole) {
        setAdminPin(trimmed)
        setRole(detectedRole)
        setUnlocked(true)
        setPinAttempts(0)
        // Fetch pin_locked status
        try {
          const { data: lockData } = await supabase.rpc('get_pin_lock_status', { p_pin: trimmed })
          if (typeof lockData === 'boolean') setPinLocked(lockData)
        } catch {}
        try {
          sessionStorage.setItem('dashboard_unlocked', 'yes')
          sessionStorage.setItem('admin_pin', trimmed)
          sessionStorage.setItem('admin_role', detectedRole)
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
      if (e) {
        if (e.message?.includes('pin_is_locked')) {
          setError('The executive PIN is locked by the super admin. Only the super admin can change it.')
          setBusy(false)
          return
        }
        throw e
      }
      // If super admin changed exec PIN, don't update own PIN
      if (!isSuperAdmin) {
        setAdminPin(newPinInput)
        try { sessionStorage.setItem('admin_pin', newPinInput) } catch {}
      }
      setShowChangePinModal(false)
      setNewPinInput('')
      flash('Executive PIN changed successfully.')
    } catch (e) { showError(e) } finally { setBusy(false) }
  }

  // ── Super Admin actions ─────────────────────────────────
  async function superAddRegistration() {
    const name = addRegName.trim()
    const code = addRegCode.trim().toUpperCase().replace(/\s+/g, '')
    if (!name || name.length < 2) { setError('Name must be at least 2 characters.'); return }
    if (!code) { setError('Enter a state code.'); return }
    setBusy(true); setError('')
    try {
      const { data, error: e } = await supabase.rpc('super_admin_add_registration', {
        p_super_pin: adminPin, p_state_code: code, p_full_name: name
      })
      if (e) throw e
      flash(`Added ${name} — Q#${data.queue_number}, Wave ${data.batch_number}`)
      setShowAddRegModal(false); setAddRegName(''); setAddRegCode('')
    } catch (e) {
      const msg = e?.message || ''
      if (msg.includes('duplicate_state_code')) setError('This state code is already registered today.')
      else if (msg.includes('invalid_super_admin_pin')) setError('Super admin access required.')
      else showError(e)
    } finally { setBusy(false) }
  }

  async function superEditRegistration() {
    if (!showEditModal) return
    const name = editName.trim()
    const code = editCode.trim().toUpperCase().replace(/\s+/g, '')
    if (!name || name.length < 2) { setError('Name must be at least 2 characters.'); return }
    if (!code) { setError('Enter a state code.'); return }
    setBusy(true); setError('')
    try {
      const { error: e } = await supabase.rpc('super_admin_edit_registration', {
        p_super_pin: adminPin, p_registration_id: showEditModal.id, p_full_name: name, p_state_code: code
      })
      if (e) throw e
      flash(`Updated ${name}.`)
      setShowEditModal(null)
    } catch (e) {
      const msg = e?.message || ''
      if (msg.includes('duplicate_state_code')) setError('That state code is already in use.')
      else showError(e)
    } finally { setBusy(false) }
  }

  async function superDeleteRegistration() {
    if (!showDeleteConfirm) return
    setRowBusy(showDeleteConfirm.id); setError('')
    try {
      const { error: e } = await supabase.rpc('super_admin_delete_registration', {
        p_super_pin: adminPin, p_registration_id: showDeleteConfirm.id
      })
      if (e) throw e
      flash(`Permanently deleted ${showDeleteConfirm.full_name}.`)
      setShowDeleteConfirm(null)
    } catch (e) { showError(e) } finally { setRowBusy(null) }
  }

  async function superTogglePinLock() {
    setBusy(true); setError('')
    try {
      const { data, error: e } = await supabase.rpc('super_admin_toggle_pin_lock', { p_super_pin: adminPin })
      if (e) throw e
      setPinLocked(data)
      flash(data ? 'Executive PIN is now locked. Executives cannot change it.' : 'Executive PIN is now unlocked. Executives can change it.')
      setShowSettingsMenu(false)
    } catch (e) { showError(e) } finally { setBusy(false) }
  }

  async function superForceExecPin() {
    if (forceExecPin.length < 4) { setError('PIN must be at least 4 characters.'); return }
    setBusy(true); setError('')
    try {
      const { error: e } = await supabase.rpc('super_admin_set_exec_pin', { p_super_pin: adminPin, p_new_pin: forceExecPin })
      if (e) throw e
      flash('Executive PIN has been changed.')
      setShowForceExecPinModal(false); setForceExecPin('')
    } catch (e) { showError(e) } finally { setBusy(false) }
  }

  // ── Super Admin panel loaders ────────────────────────────
  async function loadActivityLog() {
    setLogLoading(true)
    try {
      const { data } = await supabase.rpc('super_admin_get_activity_log', { p_super_pin: adminPin, p_limit: 100 })
      if (data) setActivityLog(data)
    } catch {} finally { setLogLoading(false) }
  }

  async function loadExecSessions() {
    try {
      const { data } = await supabase.rpc('super_admin_get_active_sessions', { p_super_pin: adminPin })
      if (data) setExecSessions(data)
    } catch {}
  }

  async function loadArchiveDates() {
    try {
      const { data } = await supabase.rpc('super_admin_get_archive_dates', { p_super_pin: adminPin })
      if (data) setArchiveDates(data)
    } catch {}
  }

  async function loadArchiveForDate(date) {
    setArchiveDate(date)
    try {
      const { data } = await supabase.rpc('super_admin_get_archives', { p_super_pin: adminPin, p_date: date })
      if (data) setArchiveRows(data)
    } catch {}
  }

  async function loadDuplicates() {
    try {
      const { data } = await supabase.rpc('super_admin_find_duplicates', { p_super_pin: adminPin })
      if (data) setDuplicates(data)
    } catch {}
  }

  async function saveAnnouncement() {
    setBusy(true); setError('')
    try {
      const { error: e } = await supabase.rpc('super_admin_set_announcement', { p_super_pin: adminPin, p_announcement: announcement })
      if (e) throw e
      flash(announcement ? 'Announcement published to all status pages.' : 'Announcement cleared.')
    } catch (e) { showError(e) } finally { setBusy(false) }
  }

  async function toggleFreeze() {
    setBusy(true); setError('')
    try {
      const { data, error: e } = await supabase.rpc('super_admin_toggle_freeze', { p_super_pin: adminPin })
      if (e) throw e
      flash(data ? 'Executive actions are now frozen. Only you can act.' : 'Executive actions unfrozen.')
    } catch (e) { showError(e) } finally { setBusy(false) }
  }

  async function moveToWave() {
    if (!showMoveWaveModal || !targetWave) return
    setBusy(true); setError('')
    try {
      const { error: e } = await supabase.rpc('super_admin_move_to_wave', { p_super_pin: adminPin, p_registration_id: showMoveWaveModal.id, p_target_wave: targetWave })
      if (e) throw e
      flash(`Moved ${showMoveWaveModal.full_name} to Wave ${targetWave}.`)
      setShowMoveWaveModal(null)
    } catch (e) { showError(e) } finally { setBusy(false) }
  }

  async function saveNote() {
    if (!showNoteModal) return
    setBusy(true); setError('')
    try {
      const { error: e } = await supabase.rpc('super_admin_set_note', { p_super_pin: adminPin, p_registration_id: showNoteModal.id, p_note: noteText })
      if (e) throw e
      flash('Note saved.')
      setShowNoteModal(null)
    } catch (e) { showError(e) } finally { setBusy(false) }
  }

  async function swapPositions() {
    if (!showSwapModal || !swapTargetCode.trim()) return
    const targetRow = rows.find(r => r.state_code === swapTargetCode.trim().toUpperCase())
    if (!targetRow) { setError('State code not found in current registrations.'); return }
    setBusy(true); setError('')
    try {
      const { error: e } = await supabase.rpc('super_admin_swap_positions', { p_super_pin: adminPin, p_id_a: showSwapModal.id, p_id_b: targetRow.id })
      if (e) throw e
      flash(`Swapped Q#${showSwapModal.queue_number} and Q#${targetRow.queue_number}.`)
      setShowSwapModal(null); setSwapTargetCode('')
    } catch (e) { showError(e) } finally { setBusy(false) }
  }

  // Bulk actions
  async function bulkMarkServed() {
    setBusy(true); setError('')
    let count = 0
    for (const id of selectedRows) {
      try {
        const row = rows.find(r => r.id === id)
        if (row && !row.served_at && !row.voided) {
          await supabase.rpc('admin_toggle_served', { p_pin: adminPin, p_registration_id: id })
          count++
        }
      } catch {}
    }
    flash(`Marked ${count} entries as served.`)
    setSelectedRows(new Set())
    setBusy(false)
  }

  async function bulkVoid() {
    setBusy(true); setError('')
    let count = 0
    for (const id of selectedRows) {
      try {
        const row = rows.find(r => r.id === id)
        if (row && !row.voided) {
          await supabase.rpc('admin_toggle_void', { p_pin: adminPin, p_registration_id: id })
          count++
        }
      } catch {}
    }
    flash(`Voided ${count} entries.`)
    setSelectedRows(new Set())
    setBusy(false)
  }

  function toggleSelectRow(id) {
    setSelectedRows(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function selectAllVisible() {
    const pageRows = filteredAndSortedRows.slice(tablePage * TABLE_PAGE_SIZE, (tablePage + 1) * TABLE_PAGE_SIZE)
    const allSelected = pageRows.every(r => selectedRows.has(r.id))
    if (allSelected) {
      setSelectedRows(new Set())
    } else {
      setSelectedRows(new Set(pageRows.map(r => r.id)))
    }
  }

  // QR Scanner
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
              // Extract state code from URL: /status/XX/00X/0000
              const match = code.data.match(/\/status\/([A-Z]{2}%2F\d{2}[A-Z]%2F\d+|[A-Z]{2}\/\d{2}[A-Z]\/\d+)/)
              if (match) {
                const stateCode = decodeURIComponent(match[1])
                stopQRScan()
                setSearchQuery(stateCode)
                flash(`Found: ${stateCode}`)
              }
            }
          }, 250)
        }
      } catch (err) {
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

  // Sound alert: play when registration count crosses thresholds
  useEffect(() => {
    if (!soundEnabled || !rows.length) return
    const current = rows.filter(r => !r.voided).length
    const thresholds = [100, 250, 500, 750, 1000]
    for (const t of thresholds) {
      if (prevRegisteredRef.current < t && current >= t) {
        try {
          const ctx = new (window.AudioContext || window.webkitAudioContext)()
          const osc = ctx.createOscillator()
          osc.type = 'sine'
          osc.frequency.value = 880
          osc.connect(ctx.destination)
          osc.start()
          setTimeout(() => { osc.stop(); ctx.close() }, 300)
        } catch {}
        flash(`${'\uD83D\uDD14'} ${current} registrations reached!`)
      }
    }
    prevRegisteredRef.current = current
  }, [rows, soundEnabled])

  // Load super admin panel data when tab changes
  useEffect(() => {
    if (!isSuperAdmin || !superTab) return
    if (superTab === 'log') loadActivityLog()
    if (superTab === 'sessions') loadExecSessions()
    if (superTab === 'archives') loadArchiveDates()
    if (superTab === 'duplicates') loadDuplicates()
    if (superTab === 'announce' && settings) setAnnouncement(settings.announcement || '')
  }, [superTab])

  async function superChangeSuperPin() {
    if (newSuperPin.length < 6) { setError('Super admin PIN must be at least 6 characters.'); return }
    setBusy(true); setError('')
    try {
      const { error: e } = await supabase.rpc('super_admin_change_pin', { p_current_super_pin: adminPin, p_new_super_pin: newSuperPin })
      if (e) throw e
      setAdminPin(newSuperPin)
      try { sessionStorage.setItem('admin_pin', newSuperPin) } catch {}
      flash('Super admin PIN changed.')
      setShowSuperPinModal(false); setNewSuperPin('')
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
          <p className="text-sm text-slate-600 mt-1">Enter your PIN to continue.</p>
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
    <div className={`max-w-5xl mx-auto p-3 sm:p-5 flex flex-col ${darkMode ? 'dark-dashboard' : ''}`} style={{ height: 'calc(100vh - 40px)' }}>
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
          You are using the default executive PIN. Change it under Settings {'\u2192'} Change executive PIN.
        </div>
      )}
      {isSuperAdmin && adminPin === 'SUPERADMIN2025' && (
        <div className="mb-3 bg-purple-100 border-2 border-purple-400 text-purple-900 rounded-xl p-3 text-sm font-semibold flex items-center gap-2">
          <Shield className="w-4 h-4 flex-shrink-0" />
          You are using the default super admin PIN. Change it under Settings {'\u2192'} Change super admin PIN.
        </div>
      )}

      {/* ── Top bar: title + role badge + settings overflow ── */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-extrabold text-slate-950">Dashboard</h1>
            {isSuperAdmin && (
              <span className="inline-flex items-center gap-1 bg-purple-100 text-purple-800 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                <Shield className="w-3 h-3" /> Super Admin
              </span>
            )}
          </div>
          <p className="text-xs text-slate-600 font-medium">Eti-Osa 3 Special CDS</p>
        </div>
        <div className="flex items-center gap-2">
          {isSuperAdmin && (
            <button
              onClick={() => { setShowAddRegModal(true); setAddRegName(''); setAddRegCode(''); setError('') }}
              className="flex items-center gap-1.5 bg-purple-700 hover:bg-purple-800 active:bg-purple-900 text-white font-bold px-3 py-2 rounded-lg text-sm transition-colors"
              aria-label="Add registration"
            >
              <Plus className="w-4 h-4" />
              Add
            </button>
          )}
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
                {/* Executive PIN change — hidden if locked and not super admin */}
                {(isSuperAdmin || !pinLocked) && (
                  <button
                    onClick={() => { setShowChangePinModal(true); setShowSettingsMenu(false) }}
                    className="w-full text-left px-4 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-100 transition-colors"
                  >
                    Change executive PIN
                  </button>
                )}
                <button
                  onClick={() => { exportCSV(); setShowSettingsMenu(false) }}
                  disabled={rows.length === 0}
                  className="w-full text-left px-4 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-100 disabled:text-slate-400 transition-colors flex items-center gap-2"
                >
                  <Download className="w-3.5 h-3.5" /> Export CSV
                </button>
                {/* Super admin only settings */}
                {isSuperAdmin && (
                  <>
                    <hr className="my-1 border-purple-200" />
                    <div className="px-4 py-1 text-[10px] uppercase tracking-wider font-bold text-purple-600">Super Admin</div>
                    <button
                      onClick={() => { setShowAddRegModal(true); setAddRegName(''); setAddRegCode(''); setError(''); setShowSettingsMenu(false) }}
                      className="w-full text-left px-4 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-100 transition-colors flex items-center gap-2"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add registration
                    </button>
                    <button
                      onClick={() => { setShowForceExecPinModal(true); setForceExecPin(''); setShowSettingsMenu(false) }}
                      className="w-full text-left px-4 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-100 transition-colors flex items-center gap-2"
                    >
                      <LockKeyhole className="w-3.5 h-3.5" /> Set executive PIN
                    </button>
                    <button
                      onClick={superTogglePinLock}
                      disabled={busy}
                      className="w-full text-left px-4 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-100 transition-colors flex items-center gap-2"
                    >
                      {pinLocked ? <Unlock className="w-3.5 h-3.5" /> : <LockKeyhole className="w-3.5 h-3.5" />}
                      {pinLocked ? 'Unlock exec PIN changes' : 'Lock exec PIN changes'}
                    </button>
                    <button
                      onClick={() => { setShowSuperPinModal(true); setNewSuperPin(''); setShowSettingsMenu(false) }}
                      className="w-full text-left px-4 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-100 transition-colors flex items-center gap-2"
                    >
                      <Shield className="w-3.5 h-3.5" /> Change super admin PIN
                    </button>
                  </>
                )}
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

      {/* Frozen banner for executives */}
      {!isSuperAdmin && settings?.exec_frozen && (
        <div className="mb-3 bg-blue-100 border-2 border-blue-400 text-blue-900 rounded-xl p-3 text-sm font-semibold flex items-center gap-2">
          <Lock className="w-4 h-4 flex-shrink-0" />
          Dashboard actions are temporarily frozen by the super admin. You can view data but cannot make changes.
        </div>
      )}

      {/* ── Super Admin Panel ── */}
      {isSuperAdmin && (
        <div className="mb-4">
          <div className="flex flex-wrap gap-1.5">
            {[
              { key: 'log', label: 'Activity Log' },
              { key: 'stats', label: 'Live Stats' },
              { key: 'announce', label: 'Announce' },
              { key: 'sessions', label: 'Exec Sessions' },
              { key: 'archives', label: 'Archives' },
              { key: 'duplicates', label: 'Duplicates' },
            ].map(t => (
              <button
                key={t.key}
                onClick={() => setSuperTab(superTab === t.key ? null : t.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  superTab === t.key
                    ? 'bg-purple-700 text-white'
                    : 'bg-purple-50 text-purple-800 hover:bg-purple-100'
                }`}
              >
                {t.label}
              </button>
            ))}
            <button
              onClick={toggleFreeze}
              disabled={busy}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                settings?.exec_frozen
                  ? 'bg-red-100 text-red-800 hover:bg-red-200'
                  : 'bg-purple-50 text-purple-800 hover:bg-purple-100'
              }`}
            >
              {settings?.exec_frozen ? '\uD83D\uDD12 Unfreeze' : '\u2744\uFE0F Freeze Execs'}
            </button>
            <button
              onClick={() => { setDarkMode(d => { const v = !d; try { localStorage.setItem('dashboard_dark', v ? 'yes' : '') } catch {}; return v }); }}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
            >
              {darkMode ? '\u2600\uFE0F Light' : '\uD83C\uDF19 Dark'}
            </button>
            <button
              onClick={startQRScan}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
            >
              {'\uD83D\uDCF7'} Scan QR
            </button>
            <button
              onClick={() => setSoundEnabled(s => !s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                soundEnabled ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {soundEnabled ? '\uD83D\uDD14 Sound On' : '\uD83D\uDD15 Sound Off'}
            </button>
          </div>

          {/* Panel content */}
          {superTab === 'log' && (
            <div className="mt-3 bg-purple-50 border border-purple-200 rounded-xl p-4 max-h-60 overflow-auto">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-extrabold text-purple-900">Activity Log</h3>
                <button onClick={loadActivityLog} className="text-xs text-purple-700 underline">{logLoading ? 'Loading...' : 'Refresh'}</button>
              </div>
              {activityLog.length === 0 ? (
                <p className="text-xs text-purple-700">No activity recorded yet.</p>
              ) : (
                <div className="space-y-1">
                  {activityLog.map(a => (
                    <div key={a.id} className="flex items-start gap-2 text-xs">
                      <span className="text-purple-500 whitespace-nowrap">{new Date(a.created_at).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${a.role === 'super_admin' ? 'bg-purple-200 text-purple-800' : 'bg-slate-200 text-slate-700'}`}>{a.role === 'super_admin' ? 'SA' : 'Exec'}</span>
                      <span className="font-semibold text-slate-900">{a.action.replace(/_/g, ' ')}</span>
                      {a.details && <span className="text-slate-600 truncate">{'\u2014'} {a.details}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {superTab === 'stats' && (
            <div className="mt-3 bg-purple-50 border border-purple-200 rounded-xl p-4">
              <h3 className="text-sm font-extrabold text-purple-900 mb-3">Live Stats</h3>
              {(() => {
                const now = new Date()
                const activeRows = rows.filter(r => !r.voided)
                const servedRows = activeRows.filter(r => r.served_at)
                // Registrations per hour
                const hourBuckets = {}
                activeRows.forEach(r => {
                  const h = new Date(r.registered_at).getHours()
                  hourBuckets[h] = (hourBuckets[h] || 0) + 1
                })
                const peakHour = Object.entries(hourBuckets).sort((a, b) => b[1] - a[1])[0]
                // Average serve time
                const serveTimes = servedRows.map(r => new Date(r.served_at) - new Date(r.registered_at)).filter(t => t > 0)
                const avgServeMs = serveTimes.length ? serveTimes.reduce((a, b) => a + b, 0) / serveTimes.length : 0
                const avgServeMins = Math.round(avgServeMs / 60000)
                // Peak wave
                const waveCounts = {}
                activeRows.forEach(r => { waveCounts[r.batch_number] = (waveCounts[r.batch_number] || 0) + 1 })
                const peakWave = Object.entries(waveCounts).sort((a, b) => b[1] - a[1])[0]
                // Serve rate
                const serveRate = activeRows.length ? Math.round((servedRows.length / activeRows.length) * 100) : 0

                return (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-white rounded-lg p-3 text-center">
                      <div className="text-[10px] uppercase font-bold text-purple-600">Avg Clear Time</div>
                      <div className="text-xl font-extrabold text-slate-900">{avgServeMins ? `${avgServeMins}m` : '--'}</div>
                    </div>
                    <div className="bg-white rounded-lg p-3 text-center">
                      <div className="text-[10px] uppercase font-bold text-purple-600">Serve Rate</div>
                      <div className="text-xl font-extrabold text-slate-900">{serveRate}%</div>
                    </div>
                    <div className="bg-white rounded-lg p-3 text-center">
                      <div className="text-[10px] uppercase font-bold text-purple-600">Peak Hour</div>
                      <div className="text-xl font-extrabold text-slate-900">{peakHour ? `${peakHour[0]}:00` : '--'}</div>
                      <div className="text-[10px] text-slate-500">{peakHour ? `${peakHour[1]} people` : ''}</div>
                    </div>
                    <div className="bg-white rounded-lg p-3 text-center">
                      <div className="text-[10px] uppercase font-bold text-purple-600">Busiest Wave</div>
                      <div className="text-xl font-extrabold text-slate-900">{peakWave ? `Wave ${peakWave[0]}` : '--'}</div>
                      <div className="text-[10px] text-slate-500">{peakWave ? `${peakWave[1]} people` : ''}</div>
                    </div>
                  </div>
                )
              })()}
              {/* Hourly breakdown */}
              <div className="mt-3">
                <div className="text-[10px] uppercase font-bold text-purple-600 mb-1">Registrations by Hour</div>
                <div className="flex items-end gap-1 h-16">
                  {(() => {
                    const activeRows = rows.filter(r => !r.voided)
                    const buckets = {}
                    activeRows.forEach(r => { const h = new Date(r.registered_at).getHours(); buckets[h] = (buckets[h] || 0) + 1 })
                    const maxCount = Math.max(1, ...Object.values(buckets))
                    const hours = []
                    for (let h = 7; h <= 18; h++) hours.push(h)
                    return hours.map(h => (
                      <div key={h} className="flex-1 flex flex-col items-center gap-0.5">
                        <div
                          className="w-full bg-purple-400 rounded-t"
                          style={{ height: `${Math.max(2, ((buckets[h] || 0) / maxCount) * 100)}%` }}
                          title={`${h}:00 - ${buckets[h] || 0} registrations`}
                        />
                        <span className="text-[8px] text-slate-500">{h}</span>
                      </div>
                    ))
                  })()}
                </div>
              </div>
            </div>
          )}

          {superTab === 'announce' && (
            <div className="mt-3 bg-purple-50 border border-purple-200 rounded-xl p-4">
              <h3 className="text-sm font-extrabold text-purple-900 mb-2">Announcement</h3>
              <p className="text-xs text-purple-700 mb-2">This message appears on every corps member's status page.</p>
              <textarea
                value={announcement}
                onChange={e => setAnnouncement(e.target.value)}
                maxLength={300}
                rows={2}
                placeholder="e.g. Break time: 1pm-2pm. Clearance resumes at 2pm."
                className="w-full rounded-lg border-2 border-purple-300 focus:border-purple-600 focus:outline-none px-3 py-2 text-sm"
              />
              <div className="flex items-center justify-between mt-2">
                <span className="text-[10px] text-purple-500">{announcement.length}/300</span>
                <div className="flex gap-2">
                  {settings?.announcement && (
                    <button onClick={() => { setAnnouncement(''); }} className="text-xs text-red-600 hover:text-red-800 font-semibold">Clear</button>
                  )}
                  <button onClick={saveAnnouncement} disabled={busy} className="px-3 py-1.5 rounded-lg bg-purple-700 hover:bg-purple-800 disabled:bg-slate-400 text-white text-xs font-bold transition-colors">
                    {busy ? 'Saving...' : announcement ? 'Publish' : 'Clear announcement'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {superTab === 'sessions' && (
            <div className="mt-3 bg-purple-50 border border-purple-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-extrabold text-purple-900">Active Executive Sessions</h3>
                <button onClick={loadExecSessions} className="text-xs text-purple-700 underline">Refresh</button>
              </div>
              {execSessions.length === 0 ? (
                <p className="text-xs text-purple-700">No active sessions detected. Executives must be on /manager or /dashboard for at least 10 seconds to appear.</p>
              ) : (
                <div className="space-y-2">
                  {execSessions.map((s, i) => (
                    <div key={i} className="bg-white rounded-lg p-3 flex items-center justify-between">
                      <div>
                        <div className="text-sm font-bold text-slate-900">{s.page === 'manager' ? 'Check-in Desk' : 'Dashboard'}</div>
                        <div className="text-xs text-slate-500">{s.page} page</div>
                      </div>
                      <div className="text-2xl font-extrabold text-purple-700">{Number(s.device_count)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {superTab === 'archives' && (
            <div className="mt-3 bg-purple-50 border border-purple-200 rounded-xl p-4 max-h-72 overflow-auto">
              <h3 className="text-sm font-extrabold text-purple-900 mb-2">Past Clearance Days</h3>
              {archiveDates.length === 0 ? (
                <p className="text-xs text-purple-700">No archived sessions yet. Archives are created when you Reset Day.</p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {archiveDates.map(d => (
                      <button
                        key={d.session_date}
                        onClick={() => loadArchiveForDate(d.session_date)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                          archiveDate === d.session_date ? 'bg-purple-700 text-white' : 'bg-white text-purple-800 hover:bg-purple-100'
                        }`}
                      >
                        {new Date(d.session_date + 'T00:00').toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })} ({Number(d.entry_count)})
                      </button>
                    ))}
                  </div>
                  {archiveDate && archiveRows.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-purple-700">{archiveRows.length} entries</span>
                        <button
                          onClick={() => {
                            const headers = ['Queue #', 'Name', 'State Code', 'Wave', 'Registered', 'Served', 'Voided']
                            const csvRows = [headers.join(',')]
                            archiveRows.forEach(r => csvRows.push([r.queue_number, `"${(r.full_name||'').replace(/"/g,'""')}"`, r.state_code, r.batch_number, r.registered_at ? new Date(r.registered_at).toLocaleString('en-NG') : '', r.served_at ? new Date(r.served_at).toLocaleString('en-NG') : '', r.voided ? 'Yes' : ''].join(',')))
                            const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' })
                            const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `archive-${archiveDate}.csv`; a.click()
                            flash('Archive CSV downloaded.')
                          }}
                          className="text-xs font-bold text-purple-700 underline"
                        >
                          Export CSV
                        </button>
                      </div>
                      <table className="w-full text-xs">
                        <thead><tr className="text-left text-purple-700"><th className="py-1 pr-2">Q#</th><th className="py-1 pr-2">Name</th><th className="py-1 pr-2">Code</th><th className="py-1">Status</th></tr></thead>
                        <tbody>
                          {archiveRows.slice(0, 50).map(r => (
                            <tr key={r.id} className={`border-t border-purple-100 ${r.voided ? 'opacity-40' : ''}`}>
                              <td className="py-1 pr-2 font-bold">{r.queue_number}</td>
                              <td className="py-1 pr-2">{r.full_name}</td>
                              <td className="py-1 pr-2 font-mono">{r.state_code}</td>
                              <td className="py-1">{r.voided ? 'Voided' : r.served_at ? 'Served' : 'Waiting'}</td>
                            </tr>
                          ))}
                          {archiveRows.length > 50 && <tr><td colSpan={4} className="py-1 text-purple-600">...and {archiveRows.length - 50} more (export CSV for full list)</td></tr>}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {superTab === 'duplicates' && (
            <div className="mt-3 bg-purple-50 border border-purple-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-extrabold text-purple-900">Duplicate Detector</h3>
                <button onClick={loadDuplicates} className="text-xs text-purple-700 underline">Refresh</button>
              </div>
              {duplicates.length === 0 ? (
                <p className="text-xs text-purple-700">No duplicates found. This checks for entries with the same name AND state code.</p>
              ) : (
                <div className="space-y-1">
                  {duplicates.map((d, i) => (
                    <div key={i} className="bg-white rounded-lg p-2 flex items-center justify-between">
                      <div>
                        <span className="text-sm font-bold text-slate-900">{d.full_name}</span>
                        <span className="text-xs text-slate-500 ml-2 font-mono">{d.state_code}</span>
                      </div>
                      <span className="text-xs font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded">{Number(d.match_count)}x</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Bulk action bar */}
      {selectedRows.size > 0 && (
        <div className="mb-3 bg-purple-100 border-2 border-purple-300 rounded-xl p-3 flex items-center justify-between">
          <span className="text-sm font-bold text-purple-900">{selectedRows.size} selected</span>
          <div className="flex gap-2">
            <button onClick={bulkMarkServed} disabled={busy} className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-400 text-white text-xs font-bold">Mark served</button>
            <button onClick={bulkVoid} disabled={busy} className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 disabled:bg-slate-400 text-white text-xs font-bold">Void all</button>
            <button onClick={() => setSelectedRows(new Set())} className="px-3 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold">Clear</button>
          </div>
        </div>
      )}

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
                {isSuperAdmin && (
                  <th className="px-2 py-2.5 w-8">
                    <input
                      type="checkbox"
                      checked={filteredAndSortedRows.slice(tablePage * TABLE_PAGE_SIZE, (tablePage + 1) * TABLE_PAGE_SIZE).length > 0 && filteredAndSortedRows.slice(tablePage * TABLE_PAGE_SIZE, (tablePage + 1) * TABLE_PAGE_SIZE).every(r => selectedRows.has(r.id))}
                      onChange={selectAllVisible}
                      className="w-4 h-4 rounded accent-purple-700"
                      aria-label="Select all on this page"
                    />
                  </th>
                )}
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
                  <td colSpan={isSuperAdmin ? 8 : 7} className="px-3 py-8 text-center text-slate-500 font-medium">
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
                  {isSuperAdmin && (
                    <td className="px-2 py-2 w-8">
                      <input
                        type="checkbox"
                        checked={selectedRows.has(r.id)}
                        onChange={() => toggleSelectRow(r.id)}
                        className="w-4 h-4 rounded accent-purple-700"
                        aria-label={`Select ${r.full_name}`}
                      />
                    </td>
                  )}
                  <td className="px-3 py-2 font-extrabold text-slate-950">{r.queue_number}</td>
                  <td className="px-3 py-2 font-semibold text-slate-950">
                    {r.full_name}
                    {isSuperAdmin && r.admin_note && <span title={r.admin_note} className="ml-1 text-purple-500 cursor-help">{'\uD83D\uDCDD'}</span>}
                  </td>
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
                      {isSuperAdmin && (
                        <>
                          <button
                            onClick={() => { setShowEditModal(r); setEditName(r.full_name); setEditCode(r.state_code); setError('') }}
                            disabled={rowBusy === r.id}
                            aria-label={`Edit ${r.full_name}`}
                            title={`Edit ${r.full_name}`}
                            className="p-1.5 rounded text-purple-500 hover:text-purple-700 hover:bg-purple-100 active:bg-purple-200 transition-colors disabled:opacity-30"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => { setShowMoveWaveModal(r); setTargetWave(settings?.current_batch || r.batch_number) }}
                            disabled={rowBusy === r.id}
                            aria-label={`Move ${r.full_name} to different wave`}
                            title="Move to wave"
                            className="p-1.5 rounded text-blue-500 hover:text-blue-700 hover:bg-blue-100 transition-colors disabled:opacity-30"
                          >
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => { setShowNoteModal(r); setNoteText(r.admin_note || '') }}
                            disabled={rowBusy === r.id}
                            aria-label={`Note on ${r.full_name}`}
                            title="Add/edit note"
                            className={`p-1.5 rounded transition-colors disabled:opacity-30 ${r.admin_note ? 'text-purple-600 hover:text-purple-800 hover:bg-purple-100' : 'text-slate-400 hover:text-purple-600 hover:bg-purple-100'}`}
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => setShowDeleteConfirm(r)}
                            disabled={rowBusy === r.id}
                            aria-label={`Delete ${r.full_name}`}
                            title={`Permanently delete ${r.full_name}`}
                            className="p-1.5 rounded text-red-400 hover:text-red-700 hover:bg-red-100 active:bg-red-200 transition-colors disabled:opacity-30"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
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
          <h2 className="text-lg font-extrabold text-slate-950">Change executive PIN</h2>
          <p className="text-slate-700 text-sm mt-1">
            Enter a new executive PIN (at least 4 characters). All executives will use this PIN.
          </p>
          <input
            type="password"
            value={newPinInput}
            onChange={(e) => setNewPinInput(e.target.value)}
            placeholder="New executive PIN"
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

      {/* ── Super Admin Modals ── */}
      {showAddRegModal && (
        <Modal onClose={() => setShowAddRegModal(false)}>
          <div className="flex items-center gap-2 mb-1">
            <Shield className="w-5 h-5 text-purple-700" />
            <h2 className="text-lg font-extrabold text-slate-950">Add registration</h2>
          </div>
          <p className="text-slate-700 text-sm">Add a corps member directly (bypasses geofence and device limits).</p>
          <div className="mt-4 space-y-3">
            <label className="block">
              <span className="text-sm font-bold text-slate-900">Full name</span>
              <input
                type="text"
                value={addRegName}
                onChange={(e) => setAddRegName(e.target.value)}
                maxLength={200}
                autoFocus
                autoCapitalize="words"
                className="mt-1 w-full rounded-lg border-2 border-slate-300 focus:border-purple-600 focus:outline-none px-3 py-2.5 text-slate-950"
                placeholder="e.g. Adaeze Okonkwo"
              />
            </label>
            <label className="block">
              <span className="text-sm font-bold text-slate-900">State code</span>
              <input
                type="text"
                value={addRegCode}
                onChange={(e) => setAddRegCode(e.target.value.toUpperCase())}
                maxLength={20}
                autoCapitalize="characters"
                className="mt-1 w-full rounded-lg border-2 border-slate-300 focus:border-purple-600 focus:outline-none px-3 py-2.5 font-mono tracking-wider text-slate-950"
                placeholder="LA/24A/1234"
              />
            </label>
          </div>
          {error && <div className="mt-3 text-red-700 text-sm font-semibold">{error}</div>}
          <div className="mt-5 flex gap-2 justify-end">
            <button onClick={() => setShowAddRegModal(false)} className="px-4 py-2 rounded-lg bg-slate-200 hover:bg-slate-300 font-semibold text-slate-900 transition-colors">Cancel</button>
            <button
              onClick={superAddRegistration}
              disabled={busy || !addRegName.trim() || !addRegCode.trim()}
              className="px-4 py-2 rounded-lg bg-purple-700 hover:bg-purple-800 disabled:bg-slate-400 text-white font-bold transition-colors"
            >
              {busy ? 'Adding...' : 'Add to queue'}
            </button>
          </div>
        </Modal>
      )}

      {showEditModal && (
        <Modal onClose={() => setShowEditModal(null)}>
          <div className="flex items-center gap-2 mb-1">
            <Pencil className="w-5 h-5 text-purple-700" />
            <h2 className="text-lg font-extrabold text-slate-950">Edit registration</h2>
          </div>
          <p className="text-slate-600 text-sm">Q#{showEditModal.queue_number} {'\u00B7'} Wave {showEditModal.batch_number}</p>
          <div className="mt-4 space-y-3">
            <label className="block">
              <span className="text-sm font-bold text-slate-900">Full name</span>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                maxLength={200}
                autoFocus
                className="mt-1 w-full rounded-lg border-2 border-slate-300 focus:border-purple-600 focus:outline-none px-3 py-2.5 text-slate-950"
              />
            </label>
            <label className="block">
              <span className="text-sm font-bold text-slate-900">State code</span>
              <input
                type="text"
                value={editCode}
                onChange={(e) => setEditCode(e.target.value.toUpperCase())}
                maxLength={20}
                className="mt-1 w-full rounded-lg border-2 border-slate-300 focus:border-purple-600 focus:outline-none px-3 py-2.5 font-mono tracking-wider text-slate-950"
              />
            </label>
          </div>
          {error && <div className="mt-3 text-red-700 text-sm font-semibold">{error}</div>}
          <div className="mt-5 flex gap-2 justify-end">
            <button onClick={() => setShowEditModal(null)} className="px-4 py-2 rounded-lg bg-slate-200 hover:bg-slate-300 font-semibold text-slate-900 transition-colors">Cancel</button>
            <button
              onClick={superEditRegistration}
              disabled={busy || !editName.trim() || !editCode.trim()}
              className="px-4 py-2 rounded-lg bg-purple-700 hover:bg-purple-800 disabled:bg-slate-400 text-white font-bold transition-colors"
            >
              {busy ? 'Saving...' : 'Save changes'}
            </button>
          </div>
        </Modal>
      )}

      {showDeleteConfirm && (
        <Modal onClose={() => setShowDeleteConfirm(null)}>
          <div className="flex items-center gap-2 mb-1">
            <Trash2 className="w-5 h-5 text-red-700" />
            <h2 className="text-lg font-extrabold text-slate-950">Permanently delete?</h2>
          </div>
          <p className="text-slate-800 text-sm mt-2">
            This will permanently remove <strong>{showDeleteConfirm.full_name}</strong> (<span className="font-mono">{showDeleteConfirm.state_code}</span>) from the queue. Unlike voiding, this <strong>cannot be undone</strong>.
          </p>
          <div className="mt-5 flex gap-2 justify-end">
            <button onClick={() => setShowDeleteConfirm(null)} className="px-4 py-2 rounded-lg bg-slate-200 hover:bg-slate-300 font-semibold text-slate-900 transition-colors">Cancel</button>
            <button
              onClick={superDeleteRegistration}
              disabled={busy}
              className="px-4 py-2 rounded-lg bg-red-700 hover:bg-red-800 disabled:bg-slate-300 text-white font-bold transition-colors"
            >
              Delete permanently
            </button>
          </div>
        </Modal>
      )}

      {showForceExecPinModal && (
        <Modal onClose={() => { setShowForceExecPinModal(false); setForceExecPin('') }}>
          <div className="flex items-center gap-2 mb-1">
            <LockKeyhole className="w-5 h-5 text-purple-700" />
            <h2 className="text-lg font-extrabold text-slate-950">Set executive PIN</h2>
          </div>
          <p className="text-slate-700 text-sm mt-1">
            Force-set the executive PIN. All executives will need to use this new PIN.
          </p>
          <input
            type="password"
            value={forceExecPin}
            onChange={(e) => setForceExecPin(e.target.value)}
            placeholder="New executive PIN"
            autoFocus
            className="mt-3 w-full text-center text-2xl tracking-[0.3em] font-bold rounded-lg border-2 border-slate-300 focus:border-purple-600 focus:outline-none px-3 py-3"
          />
          {error && <div className="mt-3 text-red-700 text-sm font-semibold">{error}</div>}
          <div className="mt-5 flex gap-2 justify-end">
            <button onClick={() => { setShowForceExecPinModal(false); setForceExecPin('') }} className="px-4 py-2 rounded-lg bg-slate-200 hover:bg-slate-300 font-semibold text-slate-900 transition-colors">Cancel</button>
            <button
              onClick={superForceExecPin}
              disabled={busy || forceExecPin.length < 4}
              className="px-4 py-2 rounded-lg bg-purple-700 hover:bg-purple-800 disabled:bg-slate-400 text-white font-bold transition-colors"
            >
              Set PIN
            </button>
          </div>
        </Modal>
      )}

      {showQRScanner && (
        <Modal onClose={stopQRScan}>
          <h2 className="text-lg font-extrabold text-slate-950 mb-2">Scan QR Code</h2>
          <p className="text-xs text-slate-600 mb-3">Point camera at a corps member's QR code to find their entry.</p>
          <div className="relative bg-black rounded-lg overflow-hidden" style={{ aspectRatio: '4/3' }}>
            <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
            <canvas ref={canvasRef} className="hidden" />
            <div className="absolute inset-0 border-4 border-white/30 rounded-lg pointer-events-none" />
          </div>
          <button onClick={stopQRScan} className="w-full mt-3 px-4 py-2 rounded-lg bg-slate-200 hover:bg-slate-300 font-semibold text-slate-900 transition-colors">Close scanner</button>
        </Modal>
      )}

      {showMoveWaveModal && (
        <Modal onClose={() => setShowMoveWaveModal(null)}>
          <div className="flex items-center gap-2 mb-1">
            <ChevronRight className="w-5 h-5 text-blue-700" />
            <h2 className="text-lg font-extrabold text-slate-950">Move to wave</h2>
          </div>
          <p className="text-slate-700 text-sm">Move <strong>{showMoveWaveModal.full_name}</strong> (currently Wave {showMoveWaveModal.batch_number}) to a different wave.</p>
          <label className="block mt-4">
            <span className="text-sm font-bold text-slate-900">Target wave</span>
            <input
              type="number"
              min={1}
              value={targetWave}
              onChange={e => setTargetWave(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border-2 border-slate-300 focus:border-blue-600 focus:outline-none px-3 py-2.5 text-lg text-slate-950"
            />
          </label>
          <p className="text-xs text-slate-500 mt-1">Currently serving: Wave {settings?.current_batch || 0}</p>
          <div className="mt-5 flex gap-2 justify-end">
            <button onClick={() => setShowMoveWaveModal(null)} className="px-4 py-2 rounded-lg bg-slate-200 hover:bg-slate-300 font-semibold text-slate-900 transition-colors">Cancel</button>
            <button onClick={moveToWave} disabled={busy || targetWave < 1} className="px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 disabled:bg-slate-400 text-white font-bold transition-colors">Move</button>
          </div>
        </Modal>
      )}

      {showNoteModal && (
        <Modal onClose={() => setShowNoteModal(null)}>
          <div className="flex items-center gap-2 mb-1">
            <Pencil className="w-5 h-5 text-purple-700" />
            <h2 className="text-lg font-extrabold text-slate-950">Note</h2>
          </div>
          <p className="text-slate-600 text-sm">{showNoteModal.full_name} {'\u00B7'} Q#{showNoteModal.queue_number}</p>
          <textarea
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
            maxLength={500}
            rows={3}
            autoFocus
            placeholder="Add a private note (only visible on dashboard)..."
            className="mt-3 w-full rounded-lg border-2 border-slate-300 focus:border-purple-600 focus:outline-none px-3 py-2 text-sm"
          />
          <div className="mt-4 flex gap-2 justify-end">
            <button onClick={() => setShowNoteModal(null)} className="px-4 py-2 rounded-lg bg-slate-200 hover:bg-slate-300 font-semibold text-slate-900 transition-colors">Cancel</button>
            <button onClick={saveNote} disabled={busy} className="px-4 py-2 rounded-lg bg-purple-700 hover:bg-purple-800 disabled:bg-slate-400 text-white font-bold transition-colors">{busy ? 'Saving...' : 'Save note'}</button>
          </div>
        </Modal>
      )}

      {showSuperPinModal && (
        <Modal onClose={() => { setShowSuperPinModal(false); setNewSuperPin('') }}>
          <div className="flex items-center gap-2 mb-1">
            <Shield className="w-5 h-5 text-purple-700" />
            <h2 className="text-lg font-extrabold text-slate-950">Change super admin PIN</h2>
          </div>
          <p className="text-slate-700 text-sm mt-1">
            Enter a new super admin PIN (at least 6 characters). Only you should know this.
          </p>
          <input
            type="password"
            value={newSuperPin}
            onChange={(e) => setNewSuperPin(e.target.value)}
            placeholder="New super admin PIN"
            autoFocus
            className="mt-3 w-full text-center text-2xl tracking-[0.3em] font-bold rounded-lg border-2 border-slate-300 focus:border-purple-600 focus:outline-none px-3 py-3"
          />
          {error && <div className="mt-3 text-red-700 text-sm font-semibold">{error}</div>}
          <div className="mt-5 flex gap-2 justify-end">
            <button onClick={() => { setShowSuperPinModal(false); setNewSuperPin('') }} className="px-4 py-2 rounded-lg bg-slate-200 hover:bg-slate-300 font-semibold text-slate-900 transition-colors">Cancel</button>
            <button
              onClick={superChangeSuperPin}
              disabled={busy || newSuperPin.length < 6}
              className="px-4 py-2 rounded-lg bg-purple-700 hover:bg-purple-800 disabled:bg-slate-400 text-white font-bold transition-colors"
            >
              Save
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
