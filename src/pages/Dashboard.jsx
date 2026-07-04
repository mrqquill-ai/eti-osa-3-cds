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
  Unlock,
  ScanLine
} from 'lucide-react'
import jsQR from 'jsqr'
import { supabase } from '../lib/supabase.js'
import { T } from '../lib/tokens.js'

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
    const [unlocked, setUnlocked] = useState(false)
  const [role, setRole] = useState('executive')
  const isSuperAdmin = role === 'super_admin'
  const [userName, setUserName] = useState('')
  const [userRole, setUserRole] = useState('')
  // Legacy PIN state (kept for manual super-admin pin entry flow)
    
  // Super admin modals
  const [showAddRegModal, setShowAddRegModal] = useState(false)
  const [addRegName, setAddRegName] = useState('')
  const [addRegCode, setAddRegCode] = useState('')
  const [showEditModal,    setShowEditModal]    = useState(null)
  const [editName,         setEditName]         = useState('')
  const [editCode,         setEditCode]         = useState('')
  const [editQueueNumber,  setEditQueueNumber]  = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null)
          
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
  const [scannedMember, setScannedMember] = useState(null)
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
  const [showVoidConfirm, setShowVoidConfirm] = useState(null)
  const [showSettingsMenu, setShowSettingsMenu] = useState(false)
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
      setUserName(meta.full_name || '')
      setUserRole(meta.role || '')



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
      if (idle > 60 * 60 * 1000) {
        supabase.auth.signOut()   // triggers onAuthStateChange → navigate to /login
        setTimeoutWarning(false)
      } else if (idle > 58 * 60 * 1000) {
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

  // rows shown in the active tab — desktop always shows all (tabs are mobile-only)
  const activeRows = (typeof window !== 'undefined' && window.innerWidth >= 1024)
    ? filteredAndSortedRows
    : dashTab === 'wave'
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
      const { error: e } = await supabase.rpc('admin_reset_day', { p_batch_size: pendingBatchSize })
      if (e) throw e
      flash('New session started.')
      setShowStartModal(false)
    } catch (e) { showError(e) } finally { setBusy(false) }
  }

  async function callNextBatch() {
    if (!settings) return
    setBusy(true); setError('')
    try {
      const { data, error: e } = await supabase.rpc('admin_call_next_batch')
      if (e) throw e
      flash(`Wave ${data} called.`)
    } catch (e) { showError(e) } finally { setBusy(false) }
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
      const { data, error: e } = await supabase.rpc('admin_go_back_batch')
      if (e) throw e
      flash(data === 0 ? 'Went back - no wave serving now.' : `Went back to wave ${data}.`)
    } catch (e) { showError(e) } finally { setBusy(false) }
  }

  async function toggleRegistration() {
    if (!settings) return
    setBusy(true); setError('')
    try {
      const { data, error: e } = await supabase.rpc('admin_toggle_registration')
      if (e) throw e
      flash(data ? 'Registration reopened.' : 'Registration closed.')
      setShowSettingsMenu(false)
    } catch (e) { showError(e) } finally { setBusy(false) }
  }

  async function toggleServed(row) {
    setRowBusy(row.id); setError('')
    try {
      const { error: e } = await supabase.rpc('admin_toggle_served', { p_registration_id: row.id })
      if (e) throw e
      flash(row.served_at ? `Unmarked ${row.full_name} as served.` : `Marked ${row.full_name} as served.`)
    } catch (e) { showError(e) } finally { setRowBusy(null) }
  }

  async function toggleVoid(row) {
    setRowBusy(row.id); setError('')
    try {
      const { error: e } = await supabase.rpc('admin_toggle_void', { p_registration_id: row.id })
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
      const { error: e } = await supabase.rpc('admin_reset_day', { p_batch_size: settings?.batch_size ?? 30 })
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



  // ── Super Admin actions ─────────────────────────────────
  async function superAddRegistration() {
    const name = addRegName.trim()
    const code = addRegCode.trim().toUpperCase().replace(/\s+/g, '')
    if (!name || name.length < 2) { setError('Name must be at least 2 characters.'); return }
    if (!code) { setError('Enter a state code.'); return }
    setBusy(true); setError('')
    try {
      const { data, error: e } = await supabase.rpc('super_admin_add_registration', {
        p_state_code: code, p_full_name: name
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
    const newQ  = parseInt(editQueueNumber, 10)
    if (!name || name.length < 2) { setError('Name must be at least 2 characters.'); return }
    if (!code) { setError('Enter a state code.'); return }
    if (!newQ || newQ < 1) { setError('Queue number must be a positive number.'); return }
    setBusy(true); setError('')
    try {
      // Update name + state code
      const { error: e1 } = await supabase.rpc('super_admin_edit_registration', {
        p_registration_id: showEditModal.id, p_full_name: name, p_state_code: code
      })
      if (e1) throw e1

      // Update queue number if changed
      if (newQ !== showEditModal.queue_number) {
        const { error: e2 } = await supabase.rpc('super_admin_set_queue_number', {
          p_registration_id: showEditModal.id, p_queue_number: newQ
        })
        if (e2) throw e2
      }

      flash(`Updated ${name}.`)
      setShowEditModal(null)
    } catch (e) {
      const msg = e?.message || ''
      if (msg.includes('duplicate_state_code')) setError('That state code is already in use.')
      else setError(msg || 'Could not save changes.')
    } finally { setBusy(false) }
  }


  async function superDeleteRegistration() {
    if (!showDeleteConfirm) return
    setRowBusy(showDeleteConfirm.id); setError('')
    try {
      const { error: e } = await supabase.rpc('super_admin_delete_registration', {
        p_registration_id: showDeleteConfirm.id
      })
      if (e) throw e
      flash(`Permanently deleted ${showDeleteConfirm.full_name}.`)
      setShowDeleteConfirm(null)
    } catch (e) { showError(e) } finally { setRowBusy(null) }
  }




  async function moveToWave() {
    if (!showMoveWaveModal || !targetWave) return
    setBusy(true); setError('')
    try {
      const { error: e } = await supabase.rpc('super_admin_move_to_wave', { p_registration_id: showMoveWaveModal.id, p_target_wave: targetWave })
      if (e) throw e
      flash(`Moved ${showMoveWaveModal.full_name} to Wave ${targetWave}.`)
      setShowMoveWaveModal(null)
    } catch (e) { showError(e) } finally { setBusy(false) }
  }

  async function saveNote() {
    if (!showNoteModal) return
    setBusy(true); setError('')
    try {
      const { error: e } = await supabase.rpc('super_admin_set_note', { p_registration_id: showNoteModal.id, p_note: noteText })
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
      const { error: e } = await supabase.rpc('super_admin_swap_positions', { p_id_a: showSwapModal.id, p_id_b: targetRow.id })
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
          await supabase.rpc('admin_toggle_served', { p_registration_id: id })
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
          await supabase.rpc('admin_toggle_void', { p_registration_id: id })
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
              // Member check-in pass: CDSMEMBER:<uuid>
              if (code.data.startsWith('CDSMEMBER:')) {
                const memberId = code.data.slice('CDSMEMBER:'.length).trim()
                stopQRScan()
                lookupScannedMember(memberId)
                return
              }
              // Fallback: state code from a /status/XX/00X/0000 URL
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

  async function lookupScannedMember(memberId) {
    try {
      const { data } = await supabase
        .from('registrations')
        .select('id, full_name, state_code, queue_number, batch_number, served_at, voided, registered_at')
        .eq('id', memberId)
        .maybeSingle()
      if (data) setScannedMember(data)
      else flash('No matching registration found.')
    } catch {
      flash('Could not look up that pass. Try again.')
    }
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
        <div className="mb-3 rounded-xl p-3 flex items-start gap-3" style={{ backgroundColor: T.dangerTint, border: `1px solid ${T.danger}` }}>
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: T.danger }} />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold" style={{ color: T.danger }}>Something went wrong</div>
            <div className="text-sm mt-0.5 whitespace-pre-wrap" style={{ color: T.danger }}>{error}</div>
          </div>
          <button onClick={() => setError('')} aria-label="Dismiss">
            <X className="w-4 h-4" style={{ color: T.danger }} />
          </button>
        </div>
      )}

      {/* ── Timeout warning ── */}
      {timeoutWarning && (
        <div className="mb-3 rounded-xl p-3 flex items-center gap-2 animate-pulse" style={{ backgroundColor: T.waitingTint, border: `1px solid ${T.waiting}` }}>
          <AlertTriangle className="w-4 h-4 flex-shrink-0" style={{ color: T.waiting }} />
          <span className="text-sm font-semibold" style={{ color: T.waiting }}>Session will lock in ~2 minutes. Tap anywhere to stay logged in.</span>
        </div>
      )}



      {/* ── Frozen banner (execs only) ── */}
      {!isSuperAdmin && settings?.exec_frozen && (
        <div className="mb-3 rounded-xl p-3 flex items-center gap-2" style={{ backgroundColor: T.brandTint, border: `1px solid ${T.brand}` }}>
          <Lock className="w-4 h-4 flex-shrink-0" style={{ color: T.brand }} />
          <span className="text-sm font-semibold" style={{ color: T.brand }}>Actions are frozen by the super admin.</span>
        </div>
      )}

      {/* ═══ Band 2: Wave console ═══ */}
      <section
        aria-label="Wave control"
        className="rounded-2xl p-4 mb-3"
        style={{ backgroundColor: T.raised, border: `1px solid ${T.line}` }}
      >
        {/* Status line: single source of truth for wave state */}
        <div className="flex items-center justify-between gap-2 min-h-[24px]">
          <p className="text-base font-bold" style={{ color: T.textPrimary }}>
            {currentWave > 0 ? `Wave ${currentWave} active` : 'No wave called yet'}
          </p>
          {currentWave > 0 && (
            <button
              onClick={goBackBatch}
              disabled={busy}
              className="text-xs font-semibold px-3 py-2 -my-2 rounded-lg transition-opacity active:opacity-70 disabled:opacity-40 min-h-[44px]"
              style={{ color: T.textSecondary }}
            >
              Undo last call
            </button>
          )}
        </div>
        {currentWave > 0 && currentWaveProgress && (
          <p className="text-xs mt-0.5" style={{ color: T.textSecondary }}>
            {currentWaveProgress.served} of {currentWaveProgress.total} served in this wave
          </p>
        )}

        {/* Stat strip: announced politely to screen readers on change */}
        <div aria-live="polite" className="grid grid-cols-3 gap-2 mt-3">
          {[
            { label: 'Registered', value: counts.registered, color: T.textPrimary, bg: T.sunken },
            { label: 'Waiting',    value: counts.waiting,    color: T.waiting,     bg: T.waitingTint },
            { label: 'Served',     value: counts.served,     color: T.served,      bg: T.servedTint },
          ].map(({ label, value, color, bg }) => (
            <div key={label} className="rounded-xl px-2 py-2.5 text-center" style={{ backgroundColor: bg }}>
              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: T.textSecondary }}>{label}</p>
              <p className="text-xl font-extrabold leading-tight tabular-nums" style={{ color }}>{value}</p>
            </div>
          ))}
        </div>

        {/* Config: interactive pills for super admin, read-only micro-text for admins */}
        {isSuperAdmin ? (
          <div className="flex gap-2 mt-3 overflow-x-auto no-scrollbar">
            <button
              onClick={() => navigate('/settings')}
              className="inline-flex items-center gap-1 flex-shrink-0 text-xs font-semibold pl-3 pr-2 rounded-full min-h-[44px] transition-opacity active:opacity-70"
              style={{ border: `1px solid ${T.line}`, color: T.textPrimary, backgroundColor: T.raised }}
            >
              {settings?.batch_size ?? '…'} per wave
              <ChevronRight className="w-3.5 h-3.5" style={{ color: T.textSecondary }} />
            </button>
            <button
              onClick={() => navigate('/settings')}
              className="inline-flex items-center gap-1 flex-shrink-0 text-xs font-semibold pl-3 pr-2 rounded-full min-h-[44px] transition-opacity active:opacity-70"
              style={{ border: `1px solid ${T.line}`, color: settings?.registration_open ? T.served : T.textSecondary, backgroundColor: T.raised }}
            >
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: settings?.registration_open ? T.served : T.line }} />
              Registration {settings?.registration_open ? 'open' : 'closed'}
              <ChevronRight className="w-3.5 h-3.5" style={{ color: T.textSecondary }} />
            </button>
            <button
              onClick={toggleGeofencing}
              disabled={busy || !settings}
              role="switch"
              aria-checked={settings?.geofencing_enabled ?? true}
              className="inline-flex items-center gap-1.5 flex-shrink-0 text-xs font-semibold px-3 rounded-full min-h-[44px] transition-opacity active:opacity-70 disabled:opacity-50"
              style={{ border: `1px solid ${T.line}`, color: (settings?.geofencing_enabled ?? true) ? T.served : T.textSecondary, backgroundColor: (settings?.geofencing_enabled ?? true) ? T.brandTint : T.raised }}
            >
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: (settings?.geofencing_enabled ?? true) ? T.served : T.line }} />
              Location {(settings?.geofencing_enabled ?? true) ? 'on' : 'off'}
            </button>
          </div>
        ) : (
          <p className="text-[11px] mt-3" style={{ color: T.textSecondary }}>
            {settings?.batch_size ?? '…'} per wave · Registration {settings?.registration_open ? 'open' : 'closed'} · Location {(settings?.geofencing_enabled ?? true) ? 'on' : 'off'}
          </p>
        )}

        {/* Primary CTA: the single solid-green element on this screen */}
        <button
          onClick={() => setShowCallWaveConfirm(true)}
          disabled={busy || !settings || nextBatchCount === 0}
          className="w-full mt-3 min-h-[48px] rounded-xl font-bold text-base flex items-center justify-center gap-2 transition-opacity active:opacity-80 disabled:opacity-50"
          style={{ backgroundColor: T.brand, color: T.onBrand }}
        >
          {nextBatchCount === 0
            ? 'No one waiting'
            : `Call Wave ${nextBatchNumber} · ${nextBatchCount} waiting`}
        </button>
      </section>

      {/* ═══ Band 3: Find ═══ */}
      <section aria-label="Find a member" className="mb-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: T.textSecondary }} />
            <input
              type="text"
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setTablePage(0) }}
              placeholder="Search by name or state code…"
              className="w-full h-12 pl-10 pr-4 rounded-xl text-sm outline-none"
              style={{ backgroundColor: T.raised, border: `1px solid ${T.line}`, color: T.textPrimary }}
            />
          </div>
          <button
            onClick={startQRScan}
            aria-label="Scan member pass"
            title="Scan member pass"
            className="flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center transition-opacity active:opacity-70"
            style={{ backgroundColor: T.brandTint, color: T.brand, border: `1px solid ${T.line}` }}
          >
            <ScanLine className="w-5 h-5" />
          </button>
        </div>

        {/* Filter tabs (mobile; desktop table always shows all) */}
        <div className="flex mt-2 p-0.5 rounded-xl lg:hidden" style={{ backgroundColor: T.sunken }}>
          {[
            { key: 'all',    label: 'All',       count: counts.registered },
            { key: 'wave',   label: 'This Wave', count: waveFilteredRows.length },
            { key: 'served', label: 'Served',    count: counts.served },
          ].map(({ key, label, count }) => (
            <button
              key={key}
              onClick={() => setDashTab(key)}
              aria-pressed={dashTab === key}
              className="flex-1 min-h-[44px] text-xs font-semibold rounded-[10px] transition-all flex items-center justify-center gap-1"
              style={{
                backgroundColor: dashTab === key ? T.raised : 'transparent',
                color:           dashTab === key ? T.textPrimary : T.textSecondary,
                boxShadow:       dashTab === key ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              }}
            >
              {label}
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full tabular-nums"
                style={{
                  backgroundColor: dashTab === key ? T.sunken : 'transparent',
                  color: T.textSecondary,
                }}
              >
                {count}
              </span>
            </button>
          ))}
        </div>
      </section>

    {/* ══ Queue section ══ */}
    <div className="mt-0">
      <div>
          {/* List group header — canonical wave numbering, never Wave 0 */}
          <div className="lg:hidden text-xs font-medium mb-2" style={{ color: T.textSecondary }}>
            {dashTab === 'served'
              ? `${servedFilteredRows.length} cleared today`
              : dashTab === 'wave'
                ? (currentWave > 0 ? `${waveFilteredRows.length} in Wave ${currentWave}` : 'No wave called yet')
                : searchQuery
                  ? `${filteredAndSortedRows.length} of ${rows.length} members`
                  : `${rows.length} members total`}
          </div>

          {/* ── Served tab: clean verification list ── */}
          {dashTab === 'served' && (
            <div className="lg:hidden bg-white rounded-xl overflow-hidden" style={{ border: `1px solid ${T.line}` }}>
              {servedFilteredRows.length === 0 ? (
                <div className="py-12 text-center text-sm" style={{ color: T.textSecondary }}>
                  {searchQuery ? 'No matches found.' : 'No one has been served yet.'}
                </div>
              ) : servedFilteredRows.map(r => (
                <div key={r.id} className="flex items-center gap-3 px-4 py-3 border-b last:border-b-0" style={{ borderColor: T.line }}>
                  <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: T.servedTint }}>
                    <Check className="w-3.5 h-3.5" style={{ color: T.served }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: T.textPrimary }}>{r.full_name}</p>
                    <p className="text-xs font-mono" style={{ color: T.textSecondary }}>{r.state_code}</p>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0" style={{ backgroundColor: T.sunken, color: T.textSecondary }}>W{r.batch_number}</span>
                  <span className="text-xs flex-shrink-0" style={{ color: T.textSecondary }}>
                    {new Date(r.served_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Top pagination — sticky on mobile so it stays reachable in a long queue */}
          {dashTab !== 'served' && filteredAndSortedRows.length > TABLE_PAGE_SIZE && (
            <div
              className="flex items-center justify-between gap-2 mb-3 px-3 py-2 rounded-xl bg-white sticky top-[60px] z-30 lg:static lg:top-auto shadow-sm"
              style={{ border: `1px solid ${T.line}` }}
            >
              <button
                onClick={() => { setTablePage(p => Math.max(0, p - 1)); window.scrollTo({ top: 0 }) }}
                disabled={tablePage === 0}
                className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-bold disabled:opacity-40 active:opacity-70"
                style={{ backgroundColor: T.brandTint, color: T.brand }}
              >
                <ChevronLeft className="w-4 h-4" /> Prev
              </button>
              <span className="text-xs font-semibold" style={{ color: T.textSecondary }}>
                Page {tablePage + 1} of {Math.ceil(filteredAndSortedRows.length / TABLE_PAGE_SIZE)}
              </span>
              <button
                onClick={() => { setTablePage(p => Math.min(Math.ceil(filteredAndSortedRows.length / TABLE_PAGE_SIZE) - 1, p + 1)); window.scrollTo({ top: 0 }) }}
                disabled={(tablePage + 1) * TABLE_PAGE_SIZE >= filteredAndSortedRows.length}
                className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-bold disabled:opacity-40 active:opacity-70"
                style={{ backgroundColor: T.brandTint, color: T.brand }}
              >
                Next <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* List — All + This Wave tabs on mobile, always on desktop */}
          <div className={`bg-white rounded-xl overflow-hidden ${dashTab === 'served' ? 'hidden lg:block' : ''}`} style={{ border: `1px solid ${T.line}` }}>
            {activeRows.length === 0 && (
              <div className="py-12 text-center text-sm" style={{ color: T.textSecondary }}>
                {searchQuery ? (
                  'No members found. Check the spelling or scan their pass instead.'
                ) : dashTab === 'wave' && currentWave <= 0 ? (
                  'No wave called yet. The queue below fills as members check in.'
                ) : (
                  <span className="flex flex-col items-center gap-3">
                    <span>No one checked in yet.</span>
                    <button
                      onClick={() => navigate('/manager')}
                      className="min-h-[44px] px-5 rounded-xl text-sm font-bold transition-opacity active:opacity-80"
                      style={{ backgroundColor: T.brandTint, color: T.brand }}
                    >
                      Open Check In
                    </button>
                  </span>
                )}
              </div>
            )}
            {/* Desktop column headers */}
            {activeRows.length > 0 && (
              <div className="hidden lg:flex items-center px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider" style={{ borderBottom: `1px solid ${T.line}`, color: T.textSecondary, backgroundColor: T.surface }}>
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
            <div className="divide-y" style={{ borderColor: T.line }}>
              {activeRows.slice(tablePage * TABLE_PAGE_SIZE, (tablePage + 1) * TABLE_PAGE_SIZE).map(r => (
                <div key={r.id}>
                  {/* Row — mobile: tap to expand | desktop: full-width table row */}
                  <div
                    className="flex items-center px-4 py-3 transition-colors"
                    style={{ backgroundColor: expandedRow === r.id ? T.surface : 'white' }}
                  >
                    {/* Q# badge */}
                    <div
                      className="w-12 h-9 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0"
                      style={{ backgroundColor: T.brandTint, color: T.brand }}
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
                        style={{ color: T.textPrimary }}
                      >
                        {r.full_name}
                      </div>
                      {/* State code visible only on mobile (desktop has its own column) */}
                      <div className="lg:hidden text-xs font-mono mt-0.5" style={{ color: T.textSecondary }}>
                        {r.state_code}
                      </div>
                    </div>

                    {/* State code column — desktop only */}
                    <div className="hidden lg:block w-32 flex-shrink-0 text-xs font-mono" style={{ color: T.textSecondary }}>
                      {r.state_code}
                    </div>

                    {/* Wave badge */}
                    <span
                      className="lg:w-14 lg:text-center text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: T.brandTint, color: T.brand }}
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
                            ? T.dangerTint
                            : r.served_at
                              ? T.brandTint
                              : T.waitingTint,
                          color: r.voided ? T.danger : r.served_at ? T.brand : T.waiting,
                        }}
                      >
                        {r.voided ? 'Voided' : r.served_at ? 'Served' : 'Waiting'}
                      </span>

                      {/* Registered time */}
                      <span className="w-20 text-xs text-right pr-2" style={{ color: T.textSecondary }}>
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
                              style={{ backgroundColor: r.served_at ? T.waiting : T.brand }}
                            >
                              {rowBusy === r.id ? '…' : r.served_at ? 'Undo' : 'Served'}
                            </button>
                          </div>
                          <div className="w-14 flex justify-center">
                            <button
                              onClick={() => setShowVoidConfirm(r)}
                              disabled={rowBusy === r.id}
                              className="px-3 py-1.5 rounded-lg text-xs font-bold transition-opacity disabled:opacity-40"
                              style={{ backgroundColor: T.dangerTint, color: T.danger }}
                            >
                              Void
                            </button>
                          </div>
                          {isSuperAdmin && (
                            <div className="w-16 flex justify-center gap-1">
                              <button
                                onClick={() => { setShowEditModal(r); setEditName(r.full_name); setEditCode(r.state_code); setEditQueueNumber(String(r.queue_number)); setError('') }}
                                disabled={rowBusy === r.id}
                                className="p-1.5 rounded-lg transition-opacity disabled:opacity-40"
                                style={{ backgroundColor: T.brandTint, color: T.brand }}
                                title="Edit"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => { setShowMoveWaveModal(r); setTargetWave(settings?.current_batch || r.batch_number) }}
                                disabled={rowBusy === r.id}
                                className="p-1.5 rounded-lg transition-opacity disabled:opacity-40"
                                style={{ backgroundColor: T.brandTint, color: T.brand }}
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
                              style={{ backgroundColor: T.waitingTint, color: T.waiting }}
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
                        color: T.line,
                        transform: expandedRow === r.id ? 'rotate(90deg)' : 'none',
                      }}
                    />
                  </div>

                  {/* Expanded panel — mobile only */}
                  {expandedRow === r.id && (
                    <div className="lg:hidden px-4 py-4" style={{ backgroundColor: T.surface, borderTop: `1px solid ${T.line}` }}>
                      <div className="grid grid-cols-2 gap-3 text-xs mb-3">
                        <div>
                          <div className="font-semibold uppercase tracking-wide mb-1" style={{ color: T.textSecondary }}>Status</div>
                          <div className="font-bold" style={{ color: r.voided ? T.danger : r.served_at ? T.brand : T.textSecondary }}>
                            {r.voided ? 'Voided' : r.served_at ? 'Served' : 'Waiting'}
                          </div>
                        </div>
                        <div>
                          <div className="font-semibold uppercase tracking-wide mb-1" style={{ color: T.textSecondary }}>Registered</div>
                          <div className="font-medium" style={{ color: T.textPrimary }}>{formatTime(r.registered_at)}</div>
                        </div>
                      </div>
                      {!r.voided && (
                        <div className="flex gap-2">
                          <button
                            onClick={e => { e.stopPropagation(); toggleServed(r) }}
                            disabled={rowBusy === r.id}
                            className="flex-1 py-2 rounded-lg text-xs font-bold text-white transition-opacity disabled:opacity-40"
                            style={{ backgroundColor: r.served_at ? T.waiting : T.brand }}
                          >
                            {rowBusy === r.id ? '...' : r.served_at ? 'Undo served' : 'Mark served'}
                          </button>
                          <button
                            onClick={e => { e.stopPropagation(); setShowVoidConfirm(r) }}
                            disabled={rowBusy === r.id}
                            className="px-4 py-2 rounded-lg text-xs font-bold transition-opacity disabled:opacity-40"
                            style={{ backgroundColor: T.dangerTint, color: T.danger }}
                          >
                            Void
                          </button>
                          {isSuperAdmin && (
                            <>
                              <button
                                onClick={e => { e.stopPropagation(); setShowEditModal(r); setEditName(r.full_name); setEditCode(r.state_code); setEditQueueNumber(String(r.queue_number)); setError('') }}
                                disabled={rowBusy === r.id}
                                className="px-3 py-2 rounded-lg transition-opacity disabled:opacity-40"
                                style={{ backgroundColor: T.brandTint, color: T.brand }}
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={e => { e.stopPropagation(); setShowMoveWaveModal(r); setTargetWave(settings?.current_batch || r.batch_number) }}
                                disabled={rowBusy === r.id}
                                className="px-3 py-2 rounded-lg transition-opacity disabled:opacity-40"
                                style={{ backgroundColor: T.brandTint, color: T.brand }}
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
                          style={{ backgroundColor: T.waitingTint, color: T.waiting }}
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
            <div className="flex items-center justify-between mt-3 text-xs font-medium" style={{ color: T.textSecondary }}>
              <button
                onClick={() => setTablePage(p => Math.max(0, p - 1))}
                disabled={tablePage === 0}
                className="px-3 py-1.5 rounded-lg bg-white disabled:opacity-40"
                style={{ border: `1px solid ${T.line}` }}
              >
                Previous
              </button>
              <span>{tablePage + 1} / {Math.ceil(filteredAndSortedRows.length / TABLE_PAGE_SIZE)}</span>
              <button
                onClick={() => setTablePage(p => Math.min(Math.ceil(filteredAndSortedRows.length / TABLE_PAGE_SIZE) - 1, p + 1))}
                disabled={(tablePage + 1) * TABLE_PAGE_SIZE >= filteredAndSortedRows.length}
                className="px-3 py-1.5 rounded-lg bg-white disabled:opacity-40"
                style={{ border: `1px solid ${T.line}` }}
              >
                Next
              </button>
            </div>
          )}
      </div>
    </div>

      {/* ── Toast ── */}
      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 px-4 py-2 rounded-xl shadow-lg text-sm font-semibold z-50 text-white" style={{ backgroundColor: T.textPrimary }}>
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
        <CallWaveSheet
          wave={nextBatchNumber}
          count={nextBatchCount}
          busy={busy}
          onCancel={() => setShowCallWaveConfirm(false)}
          onConfirm={() => { setShowCallWaveConfirm(false); callNextBatch() }}
        />
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
          <p className="text-slate-600 text-sm">Wave {showEditModal.batch_number}</p>
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
            <label className="block">
              <span className="text-sm font-bold text-slate-900">Queue number</span>
              <p className="text-xs text-slate-500 mt-0.5 mb-1">If this slot is taken, the two people swap numbers automatically.</p>
              <input
                type="number"
                min={1}
                value={editQueueNumber}
                onChange={(e) => setEditQueueNumber(e.target.value)}
                className="mt-1 w-full rounded-lg border-2 border-slate-300 focus:border-purple-600 focus:outline-none px-3 py-2.5 text-slate-950 font-mono"
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

      {scannedMember && (
        <Modal onClose={() => setScannedMember(null)}>
          <div className="text-center">
            <div className="text-xs uppercase tracking-wider font-bold" style={{ color: T.brand }}>Check-in pass</div>
            <div className="mt-1 text-xl font-extrabold text-slate-950 break-words">{scannedMember.full_name}</div>
            <div className="text-sm font-mono text-slate-600">{scannedMember.state_code}</div>
          </div>

          <div className="grid grid-cols-2 gap-3 mt-4">
            <div className="rounded-xl p-3 text-center" style={{ backgroundColor: T.brandTint }}>
              <div className="text-[10px] uppercase font-bold" style={{ color: T.brand }}>Queue #</div>
              <div className="text-2xl font-extrabold" style={{ color: T.textPrimary }}>{scannedMember.queue_number}</div>
            </div>
            <div className="rounded-xl p-3 text-center bg-slate-100">
              <div className="text-[10px] uppercase font-bold text-slate-600">Wave</div>
              <div className="text-2xl font-extrabold text-slate-900">{scannedMember.batch_number}</div>
            </div>
          </div>

          <div className="mt-3 text-center text-sm font-semibold"
            style={{ color: scannedMember.voided ? T.danger : scannedMember.served_at ? T.brand : T.waiting }}>
            {scannedMember.voided ? 'This entry was voided' : scannedMember.served_at ? 'Already served' : 'Waiting to be served'}
          </div>

          <div className="mt-4 flex gap-2">
            <button
              onClick={() => setScannedMember(null)}
              className="flex-1 py-2.5 rounded-xl bg-slate-200 hover:bg-slate-300 font-semibold text-slate-900 transition-colors"
            >
              Close
            </button>
            {!scannedMember.voided && (
              <button
                onClick={async () => { await toggleServed(scannedMember); setScannedMember(null) }}
                className="flex-1 py-2.5 rounded-xl font-bold text-white transition-opacity active:opacity-80"
                style={{ backgroundColor: scannedMember.served_at ? T.waiting : T.brand }}
              >
                {scannedMember.served_at ? 'Undo served' : 'Mark served'}
              </button>
            )}
          </div>
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



    </div>
  )
}

// ── Live stat card ───────────────────────────────────────────
function LiveStatCard({ label, value, fullWidth }) {
  return (
    <div
      className={`bg-white rounded-xl px-4 py-4 ${fullWidth ? 'col-span-2' : ''}`}
      style={{ border: `1px solid ${T.line}` }}
    >
      <div className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: T.textSecondary }}>{label}</div>
      <div className="text-4xl font-extrabold leading-none" style={{ color: T.textPrimary }}>{value}</div>
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

// ── Call Wave confirm sheet ───────────────────────────────
// Bottom sheet on mobile, centred card on desktop. Traps focus while
// open and restores it to the trigger on close.
function CallWaveSheet({ wave, count, busy, onCancel, onConfirm }) {
  const confirmRef = useRef(null)
  const cancelRef = useRef(null)
  const restoreRef = useRef(null)

  useEffect(() => {
    restoreRef.current = document.activeElement
    confirmRef.current?.focus()
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); onCancel() }
      if (e.key === 'Tab') {
        e.preventDefault()
        const next = document.activeElement === confirmRef.current ? cancelRef.current : confirmRef.current
        next?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      restoreRef.current?.focus?.()
    }
  }, [onCancel])

  return (
    <div className="fixed inset-0 z-[100] lg:flex lg:items-center lg:justify-center lg:p-6" role="dialog" aria-modal="true" aria-label={`Call Wave ${wave}`}>
      <div className="absolute inset-0" style={{ backgroundColor: 'rgba(0,0,0,0.45)' }} onClick={onCancel} />
      <div
        className="absolute bottom-0 left-0 right-0 rounded-t-2xl px-5 pt-5 lg:relative lg:bottom-auto lg:rounded-2xl lg:max-w-sm lg:w-full lg:shadow-2xl lg:pb-6"
        style={{ backgroundColor: T.raised, paddingBottom: 'calc(env(safe-area-inset-bottom) + 20px)' }}
      >
        <div className="w-10 h-1 rounded-full mx-auto mb-4 lg:hidden" style={{ backgroundColor: T.line }} />
        <h2 className="text-lg font-extrabold" style={{ color: T.textPrimary }}>Call Wave {wave}?</h2>
        <p className="text-sm mt-1" style={{ color: T.textSecondary }}>
          {count} {count === 1 ? 'person' : 'people'} will be notified.
        </p>
        <div className="mt-5 flex gap-3">
          <button
            ref={cancelRef}
            onClick={onCancel}
            className="flex-1 min-h-[48px] rounded-xl text-sm font-semibold transition-opacity active:opacity-70"
            style={{ border: `1px solid ${T.line}`, color: T.textPrimary }}
          >
            Cancel
          </button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            disabled={busy}
            className="flex-1 min-h-[48px] rounded-xl text-sm font-bold transition-opacity active:opacity-80 disabled:opacity-50"
            style={{ backgroundColor: T.brand, color: T.onBrand }}
          >
            {busy ? 'Calling…' : `Call Wave ${wave}`}
          </button>
        </div>
      </div>
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
