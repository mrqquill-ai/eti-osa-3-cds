import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
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
  ShieldCheck,
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
  const navigate = useNavigate()
  const [sessionChecked, setSessionChecked] = useState(false)   // true once auth check done
  const [adminPin, setAdminPin] = useState('')
  const [unlocked, setUnlocked] = useState(false)
  const [role, setRole] = useState('executive')
  const isSuperAdmin = role === 'super_admin'
  // Legacy PIN state (kept for manual super-admin pin entry flow)
  const [pinInput, setPinInput] = useState('')
  const [pinError, setPinError] = useState('')

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
  const [superTab, setSuperTab] = useState(null) // null=collapsed, 'approvals','log','stats','announce','sessions','archives','duplicates','venue'
  // Exec approvals
  const [execList,          setExecList]          = useState([])
  const [execListLoading,   setExecListLoading]   = useState(false)
  const [approvingId,       setApprovingId]       = useState(null)
  const [rejectingId,       setRejectingId]       = useState(null)
  const [rejectReason,      setRejectReason]      = useState('')
  const [showRejectSheet,   setShowRejectSheet]   = useState(null) // user_id string | null
  const [activityLog, setActivityLog] = useState([])
  const [logLoading, setLogLoading] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const [execSessions, setExecSessions] = useState([])
  const [archiveDates, setArchiveDates] = useState([])
  const [archiveRows, setArchiveRows] = useState([])
  const [archiveDate, setArchiveDate] = useState(null)
  const [duplicates, setDuplicates] = useState([])
  // Venue / geo settings
  const [venueGeoEnabled, setVenueGeoEnabled] = useState(true)
  const [venueLat, setVenueLat] = useState('6.4360344')
  const [venueLng, setVenueLng] = useState('3.523451')
  const [venueRadius, setVenueRadius] = useState('350')
  const [venueSuccess, setVenueSuccess] = useState('')
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
  const [dashTab, setDashTab] = useState('wave')
  const [expandedRow, setExpandedRow] = useState(null)

  // ── Auth: check session on mount, redirect to /login if missing ──
  useEffect(() => {
    async function checkSession() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        navigate('/login', { replace: true })
        return
      }
      // Derive role from user metadata (set during sign-up)
      const meta = session.user?.user_metadata || {}
      const detectedRole = meta.role === 'super_admin' ? 'super_admin' : 'executive'
      setRole(detectedRole)

      // Auto-fetch the correct PIN for this role:
      // - Super admin needs the super_pin for all super admin RPCs
      // - Regular execs need the exec pin
      try {
        if (detectedRole === 'super_admin') {
          const { data: superPin } = await supabase.rpc('get_super_pin')
          if (superPin) setAdminPin(superPin)
        } else {
          const { data: execPin } = await supabase.rpc('get_exec_pin')
          if (execPin) setAdminPin(execPin)
        }
      } catch {
        // Fallback: try exec pin
        try {
          const { data: execPin } = await supabase.rpc('get_exec_pin')
          if (execPin) setAdminPin(execPin)
        } catch {}
      }

      setUnlocked(true)
      setSessionChecked(true)
    }
    checkSession()

    // Listen for sign-out and redirect
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) navigate('/login', { replace: true })
    })
    return () => subscription.unsubscribe()
  }, [navigate])

  // Session timeout: sign out after 15 minutes of inactivity, warn at 13 min.
  useEffect(() => {
    if (!unlocked) return
    function resetTimer() { lastActivityRef.current = Date.now(); setTimeoutWarning(false) }
    const events = ['mousedown', 'keydown', 'touchstart', 'scroll']
    events.forEach((e) => window.addEventListener(e, resetTimer))
    const check = setInterval(() => {
      const idle = Date.now() - lastActivityRef.current
      if (idle > 15 * 60 * 1000) {
        supabase.auth.signOut()   // triggers onAuthStateChange → navigate to /login
        setTimeoutWarning(false)
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
      supabase.auth.signOut()
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

  // ── Tab-filtered rows ─────────────────────────────────
  const currentWave = settings?.current_batch ?? 0

  // "This Wave" — only non-voided rows in the active wave
  const waveFilteredRows = useMemo(() => {
    if (currentWave <= 0) return filteredAndSortedRows
    return filteredAndSortedRows.filter(r => !r.voided && r.batch_number === currentWave)
  }, [filteredAndSortedRows, currentWave])

  // "Served" — only served rows, most-recently-served first
  const servedFilteredRows = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    return rows
      .filter(r => !r.voided && !!r.served_at && (
        !q || r.full_name.toLowerCase().includes(q) || r.state_code.toLowerCase().includes(q)
      ))
      .sort((a, b) => new Date(b.served_at) - new Date(a.served_at))
  }, [rows, searchQuery])

  // rows shown in the active tab
  const activeRows = dashTab === 'wave'
    ? waveFilteredRows
    : dashTab === 'served'
      ? servedFilteredRows
      : filteredAndSortedRows

  function toggleSort(key) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('asc') }
  }

  // ── Actions (all use server-side PIN validation) ──────
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
        setAdminPin(newPinInput)
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
  async function loadExecList() {
    setExecListLoading(true)
    try {
      const { data } = await supabase.rpc('super_admin_list_execs', { p_super_pin: adminPin })
      if (data) setExecList(data)
    } catch (e) { showError(e) } finally { setExecListLoading(false) }
  }

  async function approveExec(userId) {
    setApprovingId(userId)
    try {
      const { error: e } = await supabase.rpc('super_admin_approve_exec', { p_super_pin: adminPin, p_user_id: userId })
      if (e) throw e
      setExecList(prev => prev.map(p => p.id === userId ? { ...p, status: 'approved', reviewed_at: new Date().toISOString(), rejection_reason: null } : p))
      flash('Access approved.')
    } catch (e) { showError(e) } finally { setApprovingId(null) }
  }

  async function rejectExec(userId) {
    setRejectingId(userId)
    try {
      const { error: e } = await supabase.rpc('super_admin_reject_exec', { p_super_pin: adminPin, p_user_id: userId, p_reason: rejectReason.trim() })
      if (e) throw e
      setExecList(prev => prev.map(p => p.id === userId ? { ...p, status: 'rejected', reviewed_at: new Date().toISOString(), rejection_reason: rejectReason.trim() } : p))
      flash('Access rejected.')
      setShowRejectSheet(null)
      setRejectReason('')
    } catch (e) { showError(e) } finally { setRejectingId(null) }
  }

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
    if (superTab === 'approvals') loadExecList()
    if (superTab === 'log') loadActivityLog()
    if (superTab === 'sessions') loadExecSessions()
    if (superTab === 'archives') loadArchiveDates()
    if (superTab === 'duplicates') loadDuplicates()
    if (superTab === 'announce' && settings) setAnnouncement(settings.announcement || '')
    if (superTab === 'venue' && settings) {
      setVenueGeoEnabled(settings.geofencing_enabled ?? true)
      setVenueLat(String(settings.venue_lat ?? '6.4360344'))
      setVenueLng(String(settings.venue_lng ?? '3.523451'))
      setVenueRadius(String(settings.venue_radius_m ?? '350'))
    }
  }, [superTab])

  // Save venue / geofencing settings (super admin)
  async function saveVenueSettings() {
    const lat = parseFloat(venueLat)
    const lng = parseFloat(venueLng)
    const radius = parseInt(venueRadius, 10)
    if (isNaN(lat) || isNaN(lng) || isNaN(radius) || radius < 50) {
      showError({ message: 'Invalid coordinates or radius (minimum 50m).' }); return
    }
    setBusy(true); setVenueSuccess('')
    try {
      const { error: e } = await supabase.rpc('super_admin_update_geo_settings', {
        p_super_pin:          adminPin,
        p_geofencing_enabled: venueGeoEnabled,
        p_venue_lat:          lat,
        p_venue_lng:          lng,
        p_venue_radius_m:     radius,
      })
      if (e) throw e
      setVenueSuccess('Venue settings saved!')
      // Update local settings cache
      setSettings(prev => prev ? { ...prev, geofencing_enabled: venueGeoEnabled, venue_lat: lat, venue_lng: lng, venue_radius_m: radius } : prev)
      setTimeout(() => setVenueSuccess(''), 3000)
    } catch (e) { showError(e) } finally { setBusy(false) }
  }

  // Toggle geofencing on/off (executive + super admin)
  async function toggleGeofencing() {
    setBusy(true)
    try {
      const newVal = !(settings?.geofencing_enabled ?? true)
      const { error: e } = await supabase
        .from('session_settings')
        .update({ geofencing_enabled: newVal })
        .eq('id', 1)
      if (e) throw e
      setSettings(prev => prev ? { ...prev, geofencing_enabled: newVal } : prev)
      flash(newVal ? 'Geofencing enabled.' : 'Geofencing disabled — corps members can join from any location.')
    } catch (e) { showError(e) } finally { setBusy(false) }
  }

  async function superChangeSuperPin() {
    if (newSuperPin.length < 6) { setError('Super admin PIN must be at least 6 characters.'); return }
    setBusy(true); setError('')
    try {
      const { error: e } = await supabase.rpc('super_admin_change_pin', { p_current_super_pin: adminPin, p_new_super_pin: newSuperPin })
      if (e) throw e
      setAdminPin(newSuperPin)
      setAdminPin(newSuperPin)
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

  // ── Session loading / redirect guard ─────────────────────
  if (!sessionChecked) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <svg className="w-8 h-8 animate-spin text-emerald-700" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
          </svg>
          <span className="text-sm font-medium">Checking session…</span>
        </div>
      </div>
    )
  }

  // ── Main dashboard ─────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto px-4 py-4 lg:max-w-none lg:px-6 lg:py-6">

      {/* ── Error banner ── */}
      {error && (
        <div className="mb-3 rounded-xl p-3 flex items-start gap-3" style={{ backgroundColor: 'rgba(192,57,43,0.08)', border: '1px solid rgba(192,57,43,0.3)' }}>
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#C0392B' }} />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold" style={{ color: '#C0392B' }}>Something went wrong</div>
            <div className="text-sm mt-0.5 whitespace-pre-wrap" style={{ color: '#C0392B' }}>{error}</div>
          </div>
          <button onClick={() => setError('')} aria-label="Dismiss">
            <X className="w-4 h-4" style={{ color: '#C0392B' }} />
          </button>
        </div>
      )}

      {/* ── Timeout warning ── */}
      {timeoutWarning && (
        <div className="mb-3 rounded-xl p-3 flex items-center gap-2 animate-pulse" style={{ backgroundColor: 'rgba(245,155,10,0.1)', border: '1px solid rgba(245,155,10,0.4)' }}>
          <AlertTriangle className="w-4 h-4 flex-shrink-0" style={{ color: '#F59B0A' }} />
          <span className="text-sm font-semibold" style={{ color: '#92640A' }}>Session will lock in ~2 minutes. Tap anywhere to stay logged in.</span>
        </div>
      )}

      {/* ── Default PIN warning ── */}
      {adminPin === '2025' && (
        <div className="mb-3 rounded-xl p-3 flex items-center gap-2" style={{ backgroundColor: 'rgba(245,155,10,0.1)', border: '1px solid rgba(245,155,10,0.4)' }}>
          <AlertTriangle className="w-4 h-4 flex-shrink-0" style={{ color: '#F59B0A' }} />
          <span className="text-sm font-semibold" style={{ color: '#92640A' }}>You are using the default executive PIN. Change it in Settings.</span>
        </div>
      )}

      {/* ── Heading ── */}
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold" style={{ color: '#0F172A' }}>Dashboard</h1>
          {isSuperAdmin && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider" style={{ backgroundColor: 'rgba(27,107,58,0.1)', color: '#1B6B3A' }}>
              <ShieldCheck className="w-3 h-3" /> Super Admin
            </span>
          )}
        </div>
        <p className="text-xs font-medium" style={{ color: '#64748B' }}>Eti-Osa 3 Special CDS</p>
      </div>

      {/* ── Status chips ── */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar mb-4 pb-0.5">
        <span className="inline-flex items-center gap-1.5 flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full bg-white" style={{ border: '1px solid #E0DDD6', color: '#0F172A' }}>
          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: '#F59B0A' }} />
          Wave {settings?.batch_size ?? '—'}
        </span>
        <span
          className="inline-flex items-center gap-1.5 flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full bg-white"
          style={{ border: '1px solid #E0DDD6', color: settings?.registration_open ? '#1B6B3A' : '#64748B' }}
        >
          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: settings?.registration_open ? '#1B6B3A' : '#64748B' }} />
          {settings?.registration_open ? 'Reg. open' : 'Reg. closed'}
        </span>
        <button
          onClick={toggleGeofencing}
          disabled={busy || !settings}
          className="inline-flex items-center gap-1.5 flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full bg-white transition-opacity disabled:opacity-50"
          style={{ border: '1px solid #E0DDD6', color: (settings?.geofencing_enabled ?? true) ? '#1B6B3A' : '#64748B' }}
        >
          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: (settings?.geofencing_enabled ?? true) ? '#1B6B3A' : '#64748B' }} />
          Location: {(settings?.geofencing_enabled ?? true) ? 'ON' : 'OFF'}
        </button>
      </div>

      {/* ── Frozen banner ── */}
      {!isSuperAdmin && settings?.exec_frozen && (
        <div className="mb-3 rounded-xl p-3 flex items-center gap-2" style={{ backgroundColor: 'rgba(27,107,58,0.06)', border: '1px solid rgba(27,107,58,0.2)' }}>
          <Lock className="w-4 h-4 flex-shrink-0" style={{ color: '#1B6B3A' }} />
          <span className="text-sm font-semibold" style={{ color: '#1B6B3A' }}>Actions are frozen by the super admin.</span>
        </div>
      )}

      {/* ════ DESKTOP ONLY: stats strip + action/search bar ════ */}
      <div className="hidden lg:block mb-5 space-y-3">
        {/* 4-column stat strip */}
        <div className="grid grid-cols-4 gap-3">
          <div className="bg-white rounded-xl p-4" style={{ border: '1px solid #E0DDD6', borderLeft: '4px solid #F59B0A' }}>
            <div className="text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: '#94A3B8' }}>Now Serving</div>
            <div className="text-2xl font-extrabold leading-none" style={{ color: '#0F172A' }}>
              {settings?.current_batch ? `Wave ${settings.current_batch}` : '—'}
            </div>
            {currentWaveProgress && (
              <div className="text-xs font-medium mt-1.5" style={{ color: '#94A3B8' }}>
                {currentWaveProgress.served} / {currentWaveProgress.total} served
              </div>
            )}
          </div>
          <div className="bg-white rounded-xl p-4" style={{ border: '1px solid #E0DDD6' }}>
            <div className="text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: '#94A3B8' }}>Registered</div>
            <div className="text-2xl font-extrabold" style={{ color: '#0F172A' }}>{counts.registered}</div>
          </div>
          <div className="bg-white rounded-xl p-4" style={{ border: '1px solid #E0DDD6' }}>
            <div className="text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: '#94A3B8' }}>Waiting</div>
            <div className="text-2xl font-extrabold" style={{ color: '#F59B0A' }}>{counts.waiting}</div>
          </div>
          <div className="bg-white rounded-xl p-4" style={{ border: '1px solid #E0DDD6' }}>
            <div className="text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: '#94A3B8' }}>Served</div>
            <div className="text-2xl font-extrabold" style={{ color: '#1B6B3A' }}>{counts.served}</div>
          </div>
        </div>

        {/* Action bar + search */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleCallNextBatch}
            disabled={busy || !settings}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white font-bold text-sm transition-opacity active:opacity-80 disabled:opacity-40"
            style={{ backgroundColor: '#1B6B3A' }}
          >
            <ChevronRight className="w-4 h-4" />
            Call Next Wave → {nextBatchNumber}
            {nextBatchCount > 0 && (
              <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}>
                {nextBatchCount}
              </span>
            )}
          </button>
          {settings?.current_batch > 0 && (
            <button
              onClick={goBackBatch}
              disabled={busy}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-opacity active:opacity-80 disabled:opacity-40"
              style={{ backgroundColor: '#F1F5F9', color: '#475569' }}
            >
              <ChevronLeft className="w-4 h-4" />
              Go back
            </button>
          )}
          <div className="flex-1" />
          <div className="relative w-72">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#94A3B8' }} />
            <input
              type="text"
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setTablePage(0) }}
              placeholder="Search by name or state code…"
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white text-sm outline-none"
              style={{ border: '1px solid #E0DDD6', color: '#0F172A' }}
              onFocus={e => { e.target.style.borderColor = '#1B6B3A'; e.target.style.boxShadow = '0 0 0 3px rgba(27,107,58,0.1)' }}
              onBlur={e => { e.target.style.borderColor = '#E0DDD6'; e.target.style.boxShadow = 'none' }}
            />
          </div>
          <span className="text-xs font-medium flex-shrink-0" style={{ color: '#94A3B8' }}>
            {filteredAndSortedRows.length} members
          </span>
        </div>
      </div>

      {/* ── Call Next Wave (mobile only) ── */}
      <button
        onClick={handleCallNextBatch}
        disabled={busy || !settings}
        className="lg:hidden w-full flex items-center justify-center gap-2 mb-2 py-4 rounded-xl text-white font-bold text-base transition-opacity active:opacity-80 disabled:opacity-40"
        style={{ backgroundColor: '#1B6B3A' }}
      >
        <ChevronRight className="w-5 h-5" />
        Call Next Wave
        {settings?.current_batch >= 0 && (
          <span className="font-extrabold">&rarr; {nextBatchNumber}</span>
        )}
        {nextBatchCount > 0 && (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}>
            {nextBatchCount}
          </span>
        )}
      </button>

      {/* ── Go back to previous wave (mobile only) ── */}
      {settings?.current_batch > 0 && (
        <button
          onClick={goBackBatch}
          disabled={busy}
          className="lg:hidden w-full flex items-center justify-center gap-2 mb-4 py-2.5 rounded-xl text-sm font-semibold transition-opacity active:opacity-80 disabled:opacity-40"
          style={{ backgroundColor: '#F1F5F9', color: '#475569' }}
        >
          <ChevronLeft className="w-4 h-4" />
          Go back to Wave {settings.current_batch - 1 === 0 ? 'start' : settings.current_batch - 1}
        </button>
      )}

      {/* ── Mobile always-visible stats strip ── */}
      <div className="lg:hidden grid grid-cols-4 gap-2 mb-3">
        {[
          { label: 'Wave',       value: currentWave > 0 ? `W${currentWave}` : '—', color: '#92400E', bg: 'rgba(245,155,10,0.08)' },
          { label: 'Registered', value: counts.registered, color: '#1B6B3A',  bg: 'rgba(27,107,58,0.06)'  },
          { label: 'Waiting',    value: counts.waiting,    color: '#1D4ED8',  bg: 'rgba(29,78,216,0.06)'  },
          { label: 'Served',     value: counts.served,     color: '#166534',  bg: 'rgba(22,101,52,0.06)'  },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className="rounded-xl px-2 py-2 text-center" style={{ backgroundColor: bg, border: '1px solid rgba(0,0,0,0.06)' }}>
            <p className="text-[9px] font-bold uppercase tracking-wider mb-0.5" style={{ color: '#94A3B8' }}>{label}</p>
            <p className="text-base font-extrabold leading-tight" style={{ color }}>{value}</p>
          </div>
        ))}
      </div>

      {/* ── 3-tab segmented control — mobile only ── */}
      <div className="flex mb-3 p-0.5 rounded-xl lg:hidden" style={{ backgroundColor: '#E2E8F0' }}>
        {[
          { key: 'all',    label: 'All',       count: counts.registered },
          { key: 'wave',   label: 'This Wave', count: waveFilteredRows.length },
          { key: 'served', label: 'Served',    count: counts.served },
        ].map(({ key, label, count }) => (
          <button
            key={key}
            onClick={() => setDashTab(key)}
            className="flex-1 py-2 text-xs font-semibold rounded-[10px] transition-all flex items-center justify-center gap-1"
            style={{
              backgroundColor: dashTab === key ? 'white' : 'transparent',
              color:           dashTab === key ? '#0F172A' : '#64748B',
              boxShadow:       dashTab === key ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            }}
          >
            {label}
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
              style={{
                backgroundColor: dashTab === key ? '#E2E8F0' : 'transparent',
                color:           dashTab === key ? '#475569' : '#94A3B8',
              }}
            >
              {count}
            </span>
          </button>
        ))}
      </div>

      {/* ═══ Super Admin panel — always visible ═══ */}
      <div className="space-y-3">
          {/* Super Admin stub */}
          {isSuperAdmin && (
            <div className="rounded-xl overflow-hidden mt-2" style={{ border: '1px solid #E0DDD6' }}>
              {/* Super admin header */}
              <div className="px-4 py-3 flex items-center justify-between" style={{ backgroundColor: '#1B6B3A' }}>
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-white" />
                  <span className="text-white font-bold text-sm">Super Admin</span>
                </div>
                {superTab && (
                  <button
                    onClick={() => setSuperTab(null)}
                    className="text-white text-xs font-semibold opacity-80 hover:opacity-100"
                  >
                    ✕ Close
                  </button>
                )}
              </div>

              {/* Tab pills */}
              <div className="flex gap-1.5 flex-wrap px-3 py-2.5 bg-white" style={{ borderBottom: '1px solid #E0DDD6' }}>
                {[
                  { key: 'approvals', label: '👤 Approvals' },
                  { key: 'announce',  label: '📢 Announce'  },
                  { key: 'log',       label: '📋 Activity'  },
                  { key: 'sessions',  label: '🔑 Sessions'  },
                  { key: 'archives',  label: '🗄 Archives'  },
                  { key: 'duplicates',label: '⚠️ Duplicates'},
                  { key: 'venue',     label: '📍 Venue'     },
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setSuperTab(superTab === key ? null : key)}
                    className="px-3 py-1.5 rounded-full text-xs font-semibold transition-colors"
                    style={{
                      backgroundColor: superTab === key ? '#1B6B3A' : '#F1F5F9',
                      color:           superTab === key ? 'white'   : '#475569',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* ── Approvals panel ── */}
              {superTab === 'approvals' && (
                <div className="bg-white">
                  <div className="px-4 pt-3 pb-1 flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wide" style={{ color: '#64748B' }}>Exec Access Requests</span>
                    <button onClick={loadExecList} disabled={execListLoading} className="text-xs font-semibold" style={{ color: '#1B6B3A' }}>
                      {execListLoading ? 'Loading…' : 'Refresh'}
                    </button>
                  </div>

                  {execListLoading && (
                    <div className="py-8 text-center text-sm" style={{ color: '#64748B' }}>Loading…</div>
                  )}

                  {!execListLoading && execList.length === 0 && (
                    <div className="py-8 text-center text-sm" style={{ color: '#64748B' }}>No exec accounts found.</div>
                  )}

                  {!execListLoading && execList.length > 0 && (
                    <div className="divide-y" style={{ borderColor: '#E0DDD6' }}>
                      {execList.map(p => (
                        <div key={p.id} className="px-4 py-3">
                          <div className="flex items-start gap-3">
                            {/* Avatar */}
                            <div
                              className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                              style={{
                                backgroundColor:
                                  p.status === 'approved' ? 'rgba(27,107,58,0.12)' :
                                  p.status === 'rejected' ? 'rgba(192,57,43,0.1)'  :
                                  'rgba(201,151,58,0.15)',
                                color:
                                  p.status === 'approved' ? '#1B6B3A' :
                                  p.status === 'rejected' ? '#C0392B' :
                                  '#A67C2E',
                              }}
                            >
                              {(p.full_name || p.email || '?')[0].toUpperCase()}
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-semibold truncate" style={{ color: '#0F172A' }}>
                                  {p.full_name || '(no name)'}
                                </span>
                                {/* Status badge */}
                                <span
                                  className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full flex-shrink-0"
                                  style={{
                                    backgroundColor:
                                      p.status === 'approved' ? 'rgba(27,107,58,0.1)'  :
                                      p.status === 'rejected' ? 'rgba(192,57,43,0.1)'  :
                                      'rgba(201,151,58,0.15)',
                                    color:
                                      p.status === 'approved' ? '#1B6B3A' :
                                      p.status === 'rejected' ? '#C0392B' :
                                      '#A67C2E',
                                  }}
                                >
                                  {p.status}
                                </span>
                              </div>
                              <div className="text-xs mt-0.5 truncate" style={{ color: '#64748B' }}>{p.email}</div>
                              <div className="text-xs mt-0.5 font-mono" style={{ color: '#94A3B8' }}>
                                {p.state_code || '—'} · {p.role}
                              </div>
                              {p.rejection_reason && (
                                <div className="text-xs mt-1 italic" style={{ color: '#C0392B' }}>
                                  Reason: {p.rejection_reason}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Action buttons */}
                          {p.status === 'pending' && (
                            <div className="flex gap-2 mt-2.5 pl-12">
                              <button
                                onClick={() => approveExec(p.id)}
                                disabled={approvingId === p.id || rejectingId === p.id}
                                className="flex-1 py-2 rounded-lg text-xs font-bold text-white transition-opacity disabled:opacity-40"
                                style={{ backgroundColor: '#1B6B3A' }}
                              >
                                {approvingId === p.id ? 'Approving…' : '✓ Approve'}
                              </button>
                              <button
                                onClick={() => { setShowRejectSheet(p.id); setRejectReason('') }}
                                disabled={approvingId === p.id || rejectingId === p.id}
                                className="flex-1 py-2 rounded-lg text-xs font-bold transition-opacity disabled:opacity-40"
                                style={{ backgroundColor: 'rgba(192,57,43,0.08)', color: '#C0392B' }}
                              >
                                ✕ Reject
                              </button>
                            </div>
                          )}

                          {p.status === 'approved' && (
                            <div className="flex gap-2 mt-2.5 pl-12">
                              <button
                                onClick={() => { setShowRejectSheet(p.id); setRejectReason('') }}
                                disabled={rejectingId === p.id}
                                className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-opacity disabled:opacity-40"
                                style={{ backgroundColor: 'rgba(192,57,43,0.07)', color: '#C0392B' }}
                              >
                                Revoke access
                              </button>
                            </div>
                          )}

                          {p.status === 'rejected' && (
                            <div className="flex gap-2 mt-2.5 pl-12">
                              <button
                                onClick={() => approveExec(p.id)}
                                disabled={approvingId === p.id}
                                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-opacity disabled:opacity-40"
                                style={{ backgroundColor: '#1B6B3A' }}
                              >
                                {approvingId === p.id ? 'Approving…' : 'Reinstate'}
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Reject / Revoke sheet ── */}
          {showRejectSheet && (
            <div className="fixed inset-0 z-[100]">
              <div className="absolute inset-0" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }} onClick={() => setShowRejectSheet(null)} />
              <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl px-5 pt-5" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}>
                <div className="w-10 h-1 rounded-full bg-slate-200 mx-auto mb-4" />
                <h3 className="text-base font-bold mb-1" style={{ color: '#0F172A' }}>
                  {execList.find(p => p.id === showRejectSheet)?.status === 'approved'
                    ? 'Revoke access'
                    : 'Reject access request'}
                </h3>
                <p className="text-sm mb-3" style={{ color: '#64748B' }}>
                  Optional: give a reason (the exec will see this).
                </p>
                <textarea
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                  placeholder="e.g. Not a registered exec for this CDS group."
                  rows={3}
                  className="w-full rounded-xl px-3.5 py-3 text-sm outline-none resize-none"
                  style={{ border: '1.5px solid #E2E8F0', color: '#0F172A' }}
                />
                <div className="flex gap-3 mt-3">
                  <button
                    onClick={() => setShowRejectSheet(null)}
                    className="flex-1 py-3 rounded-xl text-sm font-semibold border"
                    style={{ borderColor: '#E2E8F0', color: '#0F172A' }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => rejectExec(showRejectSheet)}
                    disabled={rejectingId === showRejectSheet}
                    className="flex-1 py-3 rounded-xl text-sm font-bold disabled:opacity-50"
                    style={{ backgroundColor: 'rgba(192,57,43,0.08)', color: '#C0392B', border: '1px solid #C0392B' }}
                  >
                    {rejectingId === showRejectSheet ? 'Please wait…' : 'Confirm reject'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

    {/* ══ Queue section ══ */}
    <div className="mt-0">
      <div>
          {/* Wave progress bar — mobile only, This Wave tab */}
          {dashTab === 'wave' && currentWave > 0 && currentWaveProgress && (
            <div className="lg:hidden bg-white rounded-xl px-4 py-3 mb-3" style={{ border: '1px solid #E0DDD6' }}>
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold" style={{ color: '#0F172A' }}>Wave {currentWave} progress</span>
                <span className="text-xs font-semibold" style={{ color: '#64748B' }}>{currentWaveProgress.served} / {currentWaveProgress.total} served</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: '#E2E8F0' }}>
                <div className="h-full rounded-full transition-all duration-500" style={{ backgroundColor: '#1B6B3A', width: `${currentWaveProgress.total > 0 ? Math.round((currentWaveProgress.served / currentWaveProgress.total) * 100) : 0}%` }} />
              </div>
            </div>
          )}

          {/* Search — mobile only (desktop search is in the action bar above) */}
          <div className="lg:hidden relative mb-3">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#64748B' }} />
            <input
              type="text"
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setTablePage(0) }}
              placeholder={dashTab === 'served' ? 'Verify a name or state code…' : 'Search by name or state code…'}
              className="w-full pl-10 pr-4 py-3 rounded-xl bg-white text-sm outline-none transition-all"
              style={{ border: '1px solid #E0DDD6', color: '#0F172A' }}
              onFocus={e => { e.target.style.borderColor = '#1B6B3A'; e.target.style.boxShadow = '0 0 0 3px rgba(27,107,58,0.1)' }}
              onBlur={e => { e.target.style.borderColor = '#E2E8F0'; e.target.style.boxShadow = 'none' }}
            />
          </div>

          {/* Members count — mobile only */}
          <div className="lg:hidden text-xs font-medium mb-2" style={{ color: '#64748B' }}>
            {dashTab === 'served'
              ? `${servedFilteredRows.length} cleared today`
              : dashTab === 'wave'
                ? `${waveFilteredRows.length} in Wave ${currentWave}`
                : searchQuery
                  ? `${filteredAndSortedRows.length} of ${rows.length} members`
                  : `${rows.length} members total`}
          </div>

          {/* ── Served tab: clean verification list ── */}
          {dashTab === 'served' && (
            <div className="lg:hidden bg-white rounded-xl overflow-hidden" style={{ border: '1px solid #E0DDD6' }}>
              {servedFilteredRows.length === 0 ? (
                <div className="py-12 text-center text-sm" style={{ color: '#64748B' }}>
                  {searchQuery ? 'No matches found.' : 'No one has been served yet.'}
                </div>
              ) : servedFilteredRows.map(r => (
                <div key={r.id} className="flex items-center gap-3 px-4 py-3 border-b last:border-b-0" style={{ borderColor: '#E2E8F0' }}>
                  <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#DCFCE7' }}>
                    <Check className="w-3.5 h-3.5" style={{ color: '#166534' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: '#0F172A' }}>{r.full_name}</p>
                    <p className="text-xs font-mono" style={{ color: '#94A3B8' }}>{r.state_code}</p>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0" style={{ backgroundColor: '#F1F5F9', color: '#64748B' }}>W{r.batch_number}</span>
                  <span className="text-xs flex-shrink-0" style={{ color: '#94A3B8' }}>
                    {new Date(r.served_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* List — All + This Wave tabs on mobile, always on desktop */}
          <div className={`bg-white rounded-xl overflow-hidden ${dashTab === 'served' ? 'hidden lg:block' : ''}`} style={{ border: '1px solid #E0DDD6' }}>
            {activeRows.length === 0 && (
              <div className="py-12 text-center text-sm" style={{ color: '#64748B' }}>
                {searchQuery ? 'No members found.' : dashTab === 'wave' && currentWave <= 0 ? 'No wave called yet.' : 'No registrations yet.'}
              </div>
            )}
            {/* Desktop column headers */}
            {activeRows.length > 0 && (
              <div className="hidden lg:flex items-center px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider" style={{ borderBottom: '1px solid #E2E8F0', color: '#94A3B8', backgroundColor: '#F8FAFC' }}>
                <div className="w-12 flex-shrink-0 text-center">Q#</div>
                <div className="flex-1 min-w-0 pl-3">Full Name</div>
                <div className="w-32 flex-shrink-0">State Code</div>
                <div className="w-14 flex-shrink-0 text-center">Wave</div>
                <div className="w-24 flex-shrink-0 text-center">Status</div>
                <div className="w-20 flex-shrink-0 text-right pr-2">Time</div>
                <div className="w-20 flex-shrink-0 text-center">Served</div>
                <div className="w-14 flex-shrink-0 text-center">Void</div>
                {isSuperAdmin && <div className="w-16 flex-shrink-0 text-center">Edit</div>}
              </div>
            )}
            <div className="divide-y" style={{ borderColor: '#E2E8F0' }}>
              {activeRows.slice(tablePage * TABLE_PAGE_SIZE, (tablePage + 1) * TABLE_PAGE_SIZE).map(r => (
                <div key={r.id}>
                  {/* Row — mobile: tap to expand | desktop: full-width table row */}
                  <div
                    className="flex items-center px-4 py-3 transition-colors"
                    style={{ backgroundColor: expandedRow === r.id ? '#F8FAFC' : 'white' }}
                  >
                    {/* Q# badge */}
                    <div
                      className="w-12 h-9 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0"
                      style={{ backgroundColor: 'rgba(27,107,58,0.08)', color: '#1B6B3A' }}
                    >
                      {r.queue_number}
                    </div>

                    {/* Name — tap area on mobile */}
                    <div
                      className="flex-1 min-w-0 pl-3 cursor-pointer lg:cursor-default"
                      onClick={() => setExpandedRow(expandedRow === r.id ? null : r.id)}
                    >
                      <div
                        className={`text-sm font-semibold truncate ${r.voided ? 'line-through opacity-50' : ''}`}
                        style={{ color: '#0F172A' }}
                      >
                        {r.full_name}
                      </div>
                      {/* State code visible only on mobile (desktop has its own column) */}
                      <div className="lg:hidden text-xs font-mono mt-0.5" style={{ color: '#64748B' }}>
                        {r.state_code}
                      </div>
                    </div>

                    {/* State code column — desktop only */}
                    <div className="hidden lg:block w-32 flex-shrink-0 text-xs font-mono" style={{ color: '#64748B' }}>
                      {r.state_code}
                    </div>

                    {/* Wave badge */}
                    <span
                      className="lg:w-14 lg:text-center text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: 'rgba(27,107,58,0.08)', color: '#1B6B3A' }}
                    >
                      W{r.batch_number}
                    </span>

                    {/* ── DESKTOP ONLY: status + time + action buttons ── */}
                    <div className="hidden lg:flex items-center flex-shrink-0">
                      {/* Status badge */}
                      <span
                        className="w-24 text-xs font-semibold px-2.5 py-1 rounded-full text-center"
                        style={{
                          backgroundColor: r.voided
                            ? 'rgba(192,57,43,0.08)'
                            : r.served_at
                              ? 'rgba(27,107,58,0.08)'
                              : 'rgba(245,155,10,0.10)',
                          color: r.voided ? '#C0392B' : r.served_at ? '#1B6B3A' : '#D97706',
                        }}
                      >
                        {r.voided ? 'Voided' : r.served_at ? 'Served' : 'Waiting'}
                      </span>

                      {/* Registered time */}
                      <span className="w-20 text-xs text-right pr-2" style={{ color: '#94A3B8' }}>
                        {formatTime(r.registered_at)}
                      </span>

                      {/* Actions */}
                      {!r.voided && (
                        <>
                          <div className="w-20 flex justify-center">
                            <button
                              onClick={() => toggleServed(r)}
                              disabled={rowBusy === r.id}
                              className="px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-opacity disabled:opacity-40"
                              style={{ backgroundColor: r.served_at ? '#F59B0A' : '#1B6B3A' }}
                            >
                              {rowBusy === r.id ? '…' : r.served_at ? 'Undo' : 'Served'}
                            </button>
                          </div>
                          <div className="w-14 flex justify-center">
                            <button
                              onClick={() => setShowVoidConfirm(r)}
                              disabled={rowBusy === r.id}
                              className="px-3 py-1.5 rounded-lg text-xs font-bold transition-opacity disabled:opacity-40"
                              style={{ backgroundColor: 'rgba(192,57,43,0.08)', color: '#C0392B' }}
                            >
                              Void
                            </button>
                          </div>
                          {isSuperAdmin && (
                            <div className="w-16 flex justify-center gap-1">
                              <button
                                onClick={() => { setShowEditModal(r); setEditName(r.full_name); setEditCode(r.state_code); setError('') }}
                                disabled={rowBusy === r.id}
                                className="p-1.5 rounded-lg transition-opacity disabled:opacity-40"
                                style={{ backgroundColor: 'rgba(27,107,58,0.08)', color: '#1B6B3A' }}
                                title="Edit"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => { setShowMoveWaveModal(r); setTargetWave(settings?.current_batch || r.batch_number) }}
                                disabled={rowBusy === r.id}
                                className="p-1.5 rounded-lg transition-opacity disabled:opacity-40"
                                style={{ backgroundColor: 'rgba(27,107,58,0.08)', color: '#1B6B3A' }}
                                title="Move wave"
                              >
                                <ChevronRight className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </>
                      )}
                      {r.voided && (
                        <>
                          <div className="w-20 flex justify-center">
                            <button
                              onClick={() => toggleVoid(r)}
                              disabled={rowBusy === r.id}
                              className="px-3 py-1.5 rounded-lg text-xs font-bold transition-opacity disabled:opacity-40"
                              style={{ backgroundColor: 'rgba(245,155,10,0.1)', color: '#F59B0A' }}
                            >
                              Restore
                            </button>
                          </div>
                          <div className="w-14" />
                          {isSuperAdmin && <div className="w-16" />}
                        </>
                      )}
                    </div>

                    {/* Mobile: chevron expand indicator */}
                    <ChevronRight
                      className="lg:hidden w-4 h-4 flex-shrink-0 transition-transform duration-200"
                      style={{
                        color: '#CBD5E1',
                        transform: expandedRow === r.id ? 'rotate(90deg)' : 'none',
                      }}
                    />
                  </div>

                  {/* Expanded panel — mobile only */}
                  {expandedRow === r.id && (
                    <div className="lg:hidden px-4 py-4" style={{ backgroundColor: '#F8FAFC', borderTop: '1px solid #E0DDD6' }}>
                      <div className="grid grid-cols-2 gap-3 text-xs mb-3">
                        <div>
                          <div className="font-semibold uppercase tracking-wide mb-1" style={{ color: '#64748B' }}>Status</div>
                          <div className="font-bold" style={{ color: r.voided ? '#C0392B' : r.served_at ? '#1B6B3A' : '#64748B' }}>
                            {r.voided ? 'Voided' : r.served_at ? 'Served' : 'Waiting'}
                          </div>
                        </div>
                        <div>
                          <div className="font-semibold uppercase tracking-wide mb-1" style={{ color: '#64748B' }}>Registered</div>
                          <div className="font-medium" style={{ color: '#0F172A' }}>{formatTime(r.registered_at)}</div>
                        </div>
                      </div>
                      {!r.voided && (
                        <div className="flex gap-2">
                          <button
                            onClick={e => { e.stopPropagation(); toggleServed(r) }}
                            disabled={rowBusy === r.id}
                            className="flex-1 py-2 rounded-lg text-xs font-bold text-white transition-opacity disabled:opacity-40"
                            style={{ backgroundColor: r.served_at ? '#F59B0A' : '#1B6B3A' }}
                          >
                            {rowBusy === r.id ? '...' : r.served_at ? 'Undo served' : 'Mark served'}
                          </button>
                          <button
                            onClick={e => { e.stopPropagation(); setShowVoidConfirm(r) }}
                            disabled={rowBusy === r.id}
                            className="px-4 py-2 rounded-lg text-xs font-bold transition-opacity disabled:opacity-40"
                            style={{ backgroundColor: 'rgba(192,57,43,0.08)', color: '#C0392B' }}
                          >
                            Void
                          </button>
                          {isSuperAdmin && (
                            <>
                              <button
                                onClick={e => { e.stopPropagation(); setShowEditModal(r); setEditName(r.full_name); setEditCode(r.state_code); setError('') }}
                                disabled={rowBusy === r.id}
                                className="px-3 py-2 rounded-lg transition-opacity disabled:opacity-40"
                                style={{ backgroundColor: 'rgba(27,107,58,0.08)', color: '#1B6B3A' }}
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={e => { e.stopPropagation(); setShowMoveWaveModal(r); setTargetWave(settings?.current_batch || r.batch_number) }}
                                disabled={rowBusy === r.id}
                                className="px-3 py-2 rounded-lg transition-opacity disabled:opacity-40"
                                style={{ backgroundColor: 'rgba(27,107,58,0.08)', color: '#1B6B3A' }}
                              >
                                <ChevronRight className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      )}
                      {r.voided && (
                        <button
                          onClick={e => { e.stopPropagation(); toggleVoid(r) }}
                          disabled={rowBusy === r.id}
                          className="w-full py-2 rounded-lg text-xs font-bold transition-opacity disabled:opacity-40"
                          style={{ backgroundColor: 'rgba(245,155,10,0.1)', color: '#F59B0A' }}
                        >
                          Restore
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Pagination */}
          {filteredAndSortedRows.length > TABLE_PAGE_SIZE && (
            <div className="flex items-center justify-between mt-3 text-xs font-medium" style={{ color: '#64748B' }}>
              <button
                onClick={() => setTablePage(p => Math.max(0, p - 1))}
                disabled={tablePage === 0}
                className="px-3 py-1.5 rounded-lg bg-white disabled:opacity-40"
                style={{ border: '1px solid #E0DDD6' }}
              >
                Previous
              </button>
              <span>{tablePage + 1} / {Math.ceil(filteredAndSortedRows.length / TABLE_PAGE_SIZE)}</span>
              <button
                onClick={() => setTablePage(p => Math.min(Math.ceil(filteredAndSortedRows.length / TABLE_PAGE_SIZE) - 1, p + 1))}
                disabled={(tablePage + 1) * TABLE_PAGE_SIZE >= filteredAndSortedRows.length}
                className="px-3 py-1.5 rounded-lg bg-white disabled:opacity-40"
                style={{ border: '1px solid #E0DDD6' }}
              >
                Next
              </button>
            </div>
          )}
      </div>
    </div>

      {/* ── Toast ── */}
      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 px-4 py-2 rounded-xl shadow-lg text-sm font-semibold z-50 text-white" style={{ backgroundColor: '#0F172A' }}>
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

// ── Live stat card ───────────────────────────────────────────
function LiveStatCard({ label, value, fullWidth }) {
  return (
    <div
      className={`bg-white rounded-xl px-4 py-4 ${fullWidth ? 'col-span-2' : ''}`}
      style={{ border: '1px solid #E0DDD6' }}
    >
      <div className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: '#64748B' }}>{label}</div>
      <div className="text-4xl font-extrabold leading-none" style={{ color: '#0F172A' }}>{value}</div>
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
