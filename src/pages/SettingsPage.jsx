import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Lock, Unlock, UserPlus, Download, ChevronRight } from 'lucide-react'
import { supabase, STATE_CODE_REGEX, normalizeStateCode } from '../lib/supabase.js'

const G           = '#1B6B3A'
const GOLD        = '#A67C2E'
const MUTED       = '#8C8880'
const INK         = '#1A1A1A'
const LINE        = '#E0DDD6'
const CREAM       = '#F9F6F0'
const DESTRUCTIVE = '#C0392B'

/* ── Bottom sheet for close-session confirmation ── */
function BottomSheet({ onCancel, onConfirm, busy }) {
  return (
    <div className="fixed inset-0 z-[100]">
      <div
        className="absolute inset-0"
        style={{ backgroundColor: 'rgba(0,0,0,0.35)' }}
        onClick={onCancel}
      />
      <div
        className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl px-6 pt-6"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}
      >
        <div className="w-10 h-1 rounded-full bg-line mx-auto mb-5" />
        <h3 className="text-base font-bold mb-2" style={{ color: INK }}>
          Close session?
        </h3>
        <p className="text-sm mb-6" style={{ color: MUTED }}>
          Are you sure you want to close this session? This will end check-ins for all members.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-3 rounded-xl text-sm font-semibold border transition-colors"
            style={{ borderColor: LINE, color: INK, backgroundColor: 'white' }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="flex-1 py-3 rounded-xl text-sm font-semibold border transition-colors disabled:opacity-50"
            style={{ borderColor: DESTRUCTIVE, color: DESTRUCTIVE, backgroundColor: 'white' }}
          >
            Close Session
          </button>
        </div>
      </div>
    </div>
  )
}

export default function SettingsPage() {
  const navigate = useNavigate()

  /* ── Auth guard ── */
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) navigate('/login', { replace: true })
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session) navigate('/login', { replace: true })
    })
    return () => subscription.unsubscribe()
  }, [navigate])

  /* ── Session state ── */
  const [settings,         setSettings]         = useState(null)
  const [adminPin,         setAdminPin]          = useState('')
  const [busy,             setBusy]              = useState(false)
  const [toast,            setToast]             = useState('')
  const [error,            setError]             = useState('')
  const [showCloseSheet,   setShowCloseSheet]    = useState(false)

  /* ── Manual assignment state ── */
  const [maName,    setMaName]    = useState('')
  const [maCode,    setMaCode]    = useState('')
  const [maError,   setMaError]   = useState('')
  const [maLoading, setMaLoading] = useState(false)
  const [maSuccess, setMaSuccess] = useState(null)

  /* ── Load settings + exec PIN ── */
  useEffect(() => {
    async function load() {
      const [{ data: s }] = await Promise.all([
        supabase.from('session_settings').select('*').eq('id', 1).single()
      ])
      if (s) setSettings(s)
      try {
        const { data: pin } = await supabase.rpc('get_exec_pin')
        if (pin) setAdminPin(pin)
      } catch {}
    }
    load()

    const ch = supabase
      .channel('settings-page')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'session_settings', filter: 'id=eq.1' },
        payload => setSettings(payload.new))
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [])

  function flash(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  /* ── Toggle registration (open/close) ── */
  async function toggleRegistration() {
    setBusy(true); setError('')
    try {
      const { error: e } = await supabase.rpc('admin_toggle_registration', { p_pin: adminPin })
      if (e) throw e
      flash(settings?.registration_open ? 'Session closed.' : 'Session opened.')
      setShowCloseSheet(false)
    } catch (e) {
      setError(e.message || 'Could not update session.')
    } finally {
      setBusy(false)
    }
  }

  /* ── Manual assignment ── */
  async function handleAssign(e) {
    e.preventDefault()
    setMaError('')
    setMaSuccess(null)
    const code = normalizeStateCode(maCode)
    const name = maName.trim()
    if (!name) { setMaError('Enter the corps member\'s full name.'); return }
    if (!STATE_CODE_REGEX.test(code)) {
      setMaError('State code format: XX/00X/0000 — e.g. LA/24A/1234')
      return
    }
    setMaLoading(true)
    try {
      const { data, error: e } = await supabase.rpc('register_corps_member', {
        p_state_code: code,
        p_full_name:  name,
        p_device_id:  null,
      })
      if (e) {
        const msg = e.message || ''
        if (msg.includes('duplicate_state_code')) setMaError('This state code has already registered today.')
        else if (msg.includes('registration_closed')) setMaError('Registration is currently closed.')
        else setMaError(msg || 'Could not assign. Try again.')
      } else {
        setMaSuccess(data)
        setMaName('')
        setMaCode('')
      }
    } catch (err) {
      setMaError(err.message || 'Network error. Try again.')
    } finally {
      setMaLoading(false)
    }
  }

  /* ── Export CSV ── */
  async function exportCSV() {
    setBusy(true)
    try {
      const { data } = await supabase
        .from('registrations')
        .select('*')
        .order('queue_number', { ascending: true })
        .limit(2000)
      if (!data) return
      const headers = ['Queue #', 'Full Name', 'State Code', 'Wave', 'Registered At', 'Served At', 'Voided']
      const csvRows = [headers.join(',')]
      for (const r of data) {
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
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `clearance-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
      flash('CSV downloaded.')
    } catch {}
    finally { setBusy(false) }
  }

  const isOpen = settings?.registration_open

  /* ─────────────────────────────────────── */
  return (
    <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">

      <h1 className="text-xl font-bold" style={{ color: INK }}>Settings</h1>

      {/* Error banner */}
      {error && (
        <div
          className="rounded-xl p-3 text-sm font-medium"
          style={{ backgroundColor: 'rgba(192,57,43,0.07)', color: DESTRUCTIVE, border: `1px solid ${DESTRUCTIVE}` }}
        >
          {error}
        </div>
      )}

      {/* ══ Session Control card ══ */}
      <div className="bg-white rounded-2xl overflow-hidden" style={{ border: `1px solid ${LINE}` }}>
        {/* Card header */}
        <div className="flex items-start justify-between px-5 pt-5 pb-4">
          <div className="flex items-start gap-3">
            {isOpen
              ? <Unlock className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: G }} />
              : <Lock   className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: G }} />
            }
            <div>
              <h2 className="text-base font-bold" style={{ color: INK }}>Session Control</h2>
              <p className="text-xs mt-0.5" style={{ color: MUTED }}>
                {isOpen
                  ? 'Corps members can currently register at the entrance.'
                  : 'Registration is closed. No new entries are being accepted.'}
              </p>
            </div>
          </div>
          {/* Open / Closed badge */}
          <span
            className="flex-shrink-0 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full ml-3"
            style={{
              backgroundColor: isOpen ? 'rgba(27,107,58,0.1)' : 'rgba(140,136,128,0.12)',
              color: isOpen ? G : MUTED,
            }}
          >
            {isOpen ? 'Open' : 'Closed'}
          </span>
        </div>

        {/* Action */}
        <div className="px-5 pb-5">
          {!isOpen ? (
            /* Open session button */
            <button
              onClick={toggleRegistration}
              disabled={busy || !settings || !adminPin}
              className="w-full py-3.5 rounded-xl text-white text-sm font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-50"
              style={{ backgroundColor: G }}
            >
              <ChevronRight className="w-4 h-4" />
              Open Session
            </button>
          ) : (
            /* Close session — text-only, triggers confirmation sheet */
            <button
              onClick={() => setShowCloseSheet(true)}
              disabled={busy || !settings || !adminPin}
              className="flex items-center gap-2 text-sm font-semibold px-3 py-2 rounded-lg transition-colors disabled:opacity-50"
              style={{ color: DESTRUCTIVE }}
              onMouseDown={e => { e.currentTarget.style.backgroundColor = 'rgba(192,57,43,0.08)' }}
              onMouseUp={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
            >
              <Lock className="w-4 h-4" />
              Close Session
            </button>
          )}
        </div>
      </div>

      {/* ══ Manual Assignment card ══ */}
      <div
        className="bg-white rounded-2xl overflow-hidden"
        style={{
          border: `1px solid ${LINE}`,
          borderLeft: `3px solid ${GOLD}`,
        }}
      >
        <div className="px-5 pt-5 pb-4">
          {/* MANUAL OVERRIDE label */}
          <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: '#F59B0A' }}>
            Manual Override
          </div>

          <div className="flex items-start gap-3 mb-4">
            <UserPlus className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: G }} />
            <div>
              <h2 className="text-base font-bold" style={{ color: INK }}>Manual Assignment</h2>
              <p className="text-xs mt-0.5" style={{ color: MUTED }}>
                Use this when a corps member has a faulty device and cannot check in themselves.
              </p>
            </div>
          </div>

          {/* Success result */}
          {maSuccess && (
            <div
              className="mb-4 rounded-xl p-4 text-sm"
              style={{ backgroundColor: 'rgba(27,107,58,0.07)', border: `1px solid ${LINE}` }}
            >
              <div className="font-bold mb-1" style={{ color: G }}>Assigned successfully</div>
              <div className="font-medium" style={{ color: INK }}>{maSuccess.full_name}</div>
              <div className="text-xs mt-0.5 font-mono" style={{ color: MUTED }}>
                Q#{maSuccess.queue_number} · Wave {maSuccess.batch_number}
              </div>
              <button
                onClick={() => setMaSuccess(null)}
                className="mt-3 text-xs font-semibold"
                style={{ color: G }}
              >
                Assign another →
              </button>
            </div>
          )}

          {!maSuccess && (
            <form onSubmit={handleAssign} className="space-y-3">
              {/* Full name */}
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: INK }}>
                  Full name
                </label>
                <input
                  type="text"
                  value={maName}
                  onChange={e => setMaName(e.target.value)}
                  maxLength={200}
                  autoCapitalize="words"
                  placeholder="e.g. Adaeze Okonkwo"
                  className="w-full rounded-xl px-3.5 py-3 text-sm outline-none transition-all"
                  style={{ border: `1px solid ${LINE}`, color: INK }}
                  onFocus={e => { e.target.style.borderColor = G; e.target.style.boxShadow = '0 0 0 3px rgba(27,107,58,0.1)' }}
                  onBlur={e => { e.target.style.borderColor = LINE; e.target.style.boxShadow = 'none' }}
                />
              </div>

              {/* State code */}
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: INK }}>
                  State code
                </label>
                <input
                  type="text"
                  value={maCode}
                  onChange={e => { setMaCode(e.target.value.toUpperCase()); setMaError('') }}
                  maxLength={20}
                  autoCapitalize="characters"
                  placeholder="LA/24A/1234"
                  className="w-full rounded-xl px-3.5 py-3 text-sm font-mono tracking-wider outline-none transition-all"
                  style={{ border: `1px solid ${LINE}`, color: INK }}
                  onFocus={e => { e.target.style.borderColor = G; e.target.style.boxShadow = '0 0 0 3px rgba(27,107,58,0.1)' }}
                  onBlur={e => { e.target.style.borderColor = LINE; e.target.style.boxShadow = 'none' }}
                />
                <p className="text-xs mt-1.5" style={{ color: MUTED }}>
                  e.g. LA/24A/1234
                </p>
              </div>

              {/* Error */}
              {maError && (
                <p className="text-xs font-semibold" style={{ color: DESTRUCTIVE }}>{maError}</p>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={maLoading}
                className="w-full py-3.5 rounded-xl text-sm font-bold text-white transition-all"
                style={{
                  backgroundColor: (maName.trim() && maCode.trim()) ? G : MUTED,
                  cursor: (maName.trim() && maCode.trim()) ? 'pointer' : 'not-allowed',
                }}
              >
                {maLoading ? 'Assigning…' : 'Assign Number'}
              </button>
            </form>
          )}
        </div>
      </div>

      {/* ══ More settings ══ */}
      <div className="bg-white rounded-2xl overflow-hidden" style={{ border: `1px solid ${LINE}` }}>
        <div className="px-5 pt-4 pb-1">
          <h2 className="text-sm font-bold uppercase tracking-wider" style={{ color: MUTED }}>
            More
          </h2>
        </div>

        {/* Export CSV */}
        <button
          onClick={exportCSV}
          disabled={busy}
          className="w-full flex items-center gap-3 px-5 py-4 text-left transition-colors active:bg-cream disabled:opacity-50"
        >
          <Download className="w-5 h-5 flex-shrink-0" style={{ color: G }} />
          <div className="flex-1">
            <div className="text-sm font-semibold" style={{ color: INK }}>Export CSV</div>
            <div className="text-xs mt-0.5" style={{ color: MUTED }}>Download today's full registration list</div>
          </div>
        </button>
        <div style={{ height: '1px', backgroundColor: LINE, marginLeft: '64px' }} />

        {/* App version */}
        <div className="flex items-center gap-3 px-5 py-4">
          <div className="w-5" />
          <div className="flex-1">
            <div className="text-xs" style={{ color: MUTED }}>
              Eti-Osa 3 Special CDS · NYSC Lagos State
            </div>
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 text-white px-4 py-2 rounded-lg shadow-lg text-sm font-semibold z-50 whitespace-nowrap"
          style={{ backgroundColor: INK }}>
          {toast}
        </div>
      )}

      {/* Close session confirmation sheet */}
      {showCloseSheet && (
        <BottomSheet
          onCancel={() => setShowCloseSheet(false)}
          onConfirm={toggleRegistration}
          busy={busy}
        />
      )}
    </div>
  )
}
