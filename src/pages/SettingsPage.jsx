import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Lock, Unlock, Download, PlayCircle, RotateCcw,
  Link2, Copy, MapPin, ChevronRight, AlertTriangle, X
} from 'lucide-react'
import { supabase } from '../lib/supabase.js'

const G           = '#1B6B3A'
const MUTED       = '#64748B'
const INK         = '#0F172A'
const LINE        = '#E2E8F0'
const DESTRUCTIVE = '#C0392B'

/* ─────────────────────────────────────────────────────────────────────
   ConfirmSheet — bottom sheet on mobile, centred modal on desktop
───────────────────────────────────────────────────────────────────── */
function ConfirmSheet({ title, body, confirmLabel, destructive = false, onCancel, onConfirm, busy, children }) {
  return (
    <div className="fixed inset-0 z-[100] lg:flex lg:items-center lg:justify-center lg:p-6">
      {/* Scrim */}
      <div className="absolute inset-0" style={{ backgroundColor: 'rgba(0,0,0,0.45)' }} onClick={onCancel} />

      {/* Panel — slides up from bottom on mobile, centred card on desktop */}
      <div
        className={[
          /* shared */
          'bg-white px-6 pt-5',
          /* mobile: anchored to bottom, sits above scrim via DOM order */
          'absolute bottom-0 left-0 right-0 rounded-t-2xl',
          /* desktop: centred card, z-10 so it sits above the absolute scrim */
          'lg:relative lg:z-10 lg:bottom-auto lg:left-auto lg:right-auto',
          'lg:rounded-2xl lg:max-w-md lg:w-full lg:shadow-2xl lg:pt-7 lg:pb-7',
        ].join(' ')}
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}
      >
        {/* Drag handle — mobile only */}
        <div className="lg:hidden w-10 h-1 rounded-full bg-slate-200 mx-auto mb-5" />

        <h3 className="text-base font-bold mb-1" style={{ color: INK }}>{title}</h3>
        {body && <p className="text-sm mb-4" style={{ color: MUTED }}>{body}</p>}
        {children}

        <div className="flex gap-3 mt-4">
          <button
            onClick={onCancel}
            className="flex-1 py-3 rounded-xl text-sm font-semibold border"
            style={{ borderColor: LINE, color: INK }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="flex-1 py-3 rounded-xl text-sm font-bold transition-colors disabled:opacity-50"
            style={{
              backgroundColor: destructive ? 'rgba(192,57,43,0.08)' : G,
              color: destructive ? DESTRUCTIVE : 'white',
              border: destructive ? `1px solid ${DESTRUCTIVE}` : 'none',
            }}
          >
            {busy ? 'Please wait…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Thin divider (indented) ── */
function Divider() {
  return <div style={{ height: '1px', backgroundColor: LINE, marginLeft: '52px' }} />
}

/* ── Settings row ── */
function SettingsRow({ icon: Icon, iconColor = G, title, subtitle, onClick, disabled, rightEl, destructive }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-slate-50 active:bg-slate-50 disabled:opacity-40"
    >
      <Icon className="w-5 h-5 flex-shrink-0" style={{ color: destructive ? DESTRUCTIVE : iconColor }} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold" style={{ color: destructive ? DESTRUCTIVE : INK }}>{title}</div>
        {subtitle && <div className="text-xs mt-0.5" style={{ color: MUTED }}>{subtitle}</div>}
      </div>
      {rightEl}
    </button>
  )
}

/* ── Card wrapper ── */
function Card({ children }) {
  return (
    <div className="bg-white rounded-2xl overflow-hidden" style={{ border: `1px solid ${LINE}` }}>
      {children}
    </div>
  )
}

/* ── Card header ── */
function CardHeader({ label }) {
  return (
    <div className="px-5 py-3 border-b" style={{ borderColor: LINE }}>
      <h2 className="text-xs font-bold uppercase tracking-wider" style={{ color: MUTED }}>{label}</h2>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   Page
═══════════════════════════════════════════════════════════════════ */
export default function SettingsPage() {
  const navigate = useNavigate()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) navigate('/login', { replace: true })
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session) navigate('/login', { replace: true })
    })
    return () => subscription.unsubscribe()
  }, [navigate])

  const [settings,    setSettings]    = useState(null)
  const [adminPin,    setAdminPin]    = useState('')
  const [busy,        setBusy]        = useState(false)
  const [toast,       setToast]       = useState('')
  const [error,       setError]       = useState('')
  const [sheet,       setSheet]       = useState(null)
  const [copied,      setCopied]      = useState(false)
  const [newBatchSize,setNewBatchSize]= useState(30)
  const [newPin,      setNewPin]      = useState('')
  const [resetText,   setResetText]   = useState('')
  const [venueLat,    setVenueLat]    = useState('')
  const [venueLng,    setVenueLng]    = useState('')
  const [venueRadius, setVenueRadius] = useState('')
  const [geoEnabled,  setGeoEnabled]  = useState(true)

  useEffect(() => {
    async function load() {
      const { data: s } = await supabase.from('session_settings').select('*').eq('id', 1).single()
      if (s) {
        setSettings(s)
        setNewBatchSize(s.batch_size ?? 30)
        setVenueLat(String(s.venue_lat ?? '6.4360344'))
        setVenueLng(String(s.venue_lng ?? '3.523451'))
        setVenueRadius(String(s.venue_radius_m ?? '350'))
        setGeoEnabled(s.geofencing_enabled ?? true)
      }
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

  function flash(msg) { setToast(msg); setTimeout(() => setToast(''), 3000) }
  function closeSheet() { setSheet(null); setError('') }

  async function copyLink() {
    const url = `${window.location.origin}/join`
    try { await navigator.clipboard.writeText(url) } catch {
      const inp = document.createElement('input')
      inp.value = url; document.body.appendChild(inp); inp.select()
      document.execCommand('copy'); document.body.removeChild(inp)
    }
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  async function toggleRegistration() {
    setBusy(true); setError('')
    const newVal = !settings?.registration_open
    setSettings(prev => ({ ...prev, registration_open: newVal }))
    try {
      const { error: e } = await supabase.rpc('admin_toggle_registration', { p_pin: adminPin })
      if (e) throw e
      flash(newVal ? 'Session opened.' : 'Session closed.')
      closeSheet()
    } catch (e) {
      setSettings(prev => ({ ...prev, registration_open: !newVal }))
      setError(e.message || 'Could not update session.')
    } finally { setBusy(false) }
  }

  async function toggleGeofencing() {
    setBusy(true); setError('')
    const newVal = !(settings?.geofencing_enabled ?? true)
    setSettings(prev => ({ ...prev, geofencing_enabled: newVal }))
    try {
      const { error: e } = await supabase.from('session_settings').update({ geofencing_enabled: newVal }).eq('id', 1)
      if (e) throw e
      flash(newVal ? 'Location check enabled.' : 'Location check disabled.')
    } catch (e) {
      setSettings(prev => ({ ...prev, geofencing_enabled: !newVal }))
      setError(e.message || 'Could not update.')
    } finally { setBusy(false) }
  }

  async function startNewSession() {
    if (newBatchSize < 10 || newBatchSize > 100) { setError('Wave size must be 10–100.'); return }
    setBusy(true); setError('')
    try {
      const { error: e } = await supabase.rpc('admin_reset_day', { p_pin: adminPin, p_batch_size: newBatchSize })
      if (e) throw e
      flash('New session started.')
      closeSheet()
    } catch (e) { setError(e.message || 'Could not start session.') } finally { setBusy(false) }
  }

  async function changeBatchSize() {
    if (newBatchSize < 10 || newBatchSize > 100) { setError('Wave size must be 10–100.'); return }
    setBusy(true); setError('')
    try {
      const { error: e } = await supabase.from('session_settings').update({ batch_size: newBatchSize }).eq('id', 1)
      if (e) throw e
      flash(`Wave size changed to ${newBatchSize}.`)
      closeSheet()
    } catch (e) { setError(e.message || 'Could not update.') } finally { setBusy(false) }
  }

  async function changePin() {
    if (newPin.length < 4) { setError('PIN must be at least 4 characters.'); return }
    setBusy(true); setError('')
    try {
      const { error: e } = await supabase.rpc('admin_change_pin', { p_current_pin: adminPin, p_new_pin: newPin })
      if (e) throw e
      setAdminPin(newPin)
      flash('Executive PIN changed.')
      setNewPin('')
      closeSheet()
    } catch (e) { setError(e.message || 'Could not change PIN.') } finally { setBusy(false) }
  }

  async function resetDay() {
    if (resetText !== 'RESET') { setError('Type RESET to confirm.'); return }
    setBusy(true); setError('')
    try {
      const { error: e } = await supabase.rpc('admin_reset_day', { p_pin: adminPin, p_batch_size: settings?.batch_size ?? 30 })
      if (e) throw e
      flash('Day reset. All entries archived.')
      setResetText('')
      closeSheet()
    } catch (e) { setError(e.message || 'Could not reset.') } finally { setBusy(false) }
  }

  async function saveLocation() {
    const lat = parseFloat(venueLat)
    const lng = parseFloat(venueLng)
    const radius = parseInt(venueRadius, 10)
    if (isNaN(lat) || isNaN(lng) || isNaN(radius) || radius < 50) {
      setError('Check your coordinates and radius (minimum 50 m).')
      return
    }
    setBusy(true); setError('')
    try {
      const { error: e } = await supabase.from('session_settings').update({
        geofencing_enabled: geoEnabled,
        venue_lat: lat, venue_lng: lng, venue_radius_m: radius,
      }).eq('id', 1)
      if (e) throw e
      flash('Location settings saved.')
      closeSheet()
    } catch (e) { setError(e.message || 'Could not save location.') } finally { setBusy(false) }
  }

  async function exportCSV() {
    setBusy(true)
    try {
      const { data } = await supabase.from('registrations').select('*').order('queue_number', { ascending: true }).limit(2000)
      if (!data) return
      const headers = ['Queue #', 'Full Name', 'State Code', 'Wave', 'Registered At', 'Served At', 'Voided']
      const csvRows = [headers.join(',')]
      for (const r of data) {
        csvRows.push([
          r.queue_number,
          `"${r.full_name.replace(/"/g, '""')}"`,
          r.state_code, r.batch_number,
          new Date(r.registered_at).toLocaleString('en-NG'),
          r.served_at ? new Date(r.served_at).toLocaleString('en-NG') : '',
          r.voided ? 'Yes' : ''
        ].join(','))
      }
      const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `clearance-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(a.href)
      flash('CSV downloaded.')
    } catch {} finally { setBusy(false) }
  }

  const isOpen = settings?.registration_open
  const geoOn  = settings?.geofencing_enabled ?? true

  return (
    <div className="max-w-2xl mx-auto px-4 py-4 lg:max-w-5xl lg:px-8 lg:py-8">

      {/* Header */}
      <div className="mb-5 lg:mb-6">
        <h1 className="text-xl font-bold" style={{ color: INK }}>Settings</h1>
        <p className="text-sm mt-0.5" style={{ color: MUTED }}>Manage session, location and data</p>
      </div>

      {/* Error banner */}
      {error && !sheet && (
        <div className="mb-4 rounded-xl p-3 flex items-start gap-3"
          style={{ backgroundColor: 'rgba(192,57,43,0.07)', border: `1px solid ${DESTRUCTIVE}` }}>
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: DESTRUCTIVE }} />
          <span className="flex-1 text-sm font-medium" style={{ color: DESTRUCTIVE }}>{error}</span>
          <button onClick={() => setError('')}><X className="w-4 h-4" style={{ color: DESTRUCTIVE }} /></button>
        </div>
      )}

      {/* ══ Two-column grid on desktop, single-column on mobile ══ */}
      <div className="space-y-4 lg:grid lg:grid-cols-2 lg:gap-5 lg:space-y-0">

        {/* ── LEFT COLUMN ── */}
        <div className="space-y-4">

          {/* SESSION */}
          <Card>
            <CardHeader label="Session" />

            {/* Open / Close registration */}
            <div className="flex items-center gap-3 px-5 py-4">
              {isOpen
                ? <Unlock className="w-5 h-5 flex-shrink-0" style={{ color: G }} />
                : <Lock   className="w-5 h-5 flex-shrink-0" style={{ color: MUTED }} />
              }
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold" style={{ color: INK }}>Registration</div>
                <div className="text-xs mt-0.5" style={{ color: MUTED }}>
                  {isOpen ? 'Corps members can check in.' : 'No new check-ins allowed.'}
                </div>
              </div>
              <button
                onClick={isOpen ? () => setSheet('closeSession') : toggleRegistration}
                disabled={busy || !settings || !adminPin}
                className="flex-shrink-0 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
                style={{
                  backgroundColor: isOpen ? 'rgba(192,57,43,0.08)' : 'rgba(27,107,58,0.1)',
                  color: isOpen ? DESTRUCTIVE : G,
                }}
              >
                {isOpen ? 'Close' : 'Open'}
              </button>
            </div>

            <Divider />

            <SettingsRow
              icon={PlayCircle}
              title="Start New Session"
              subtitle="Archives today's entries and resets the queue"
              onClick={() => { setNewBatchSize(settings?.batch_size ?? 30); setSheet('newSession'); setError('') }}
              disabled={!settings || !adminPin}
            />

            <Divider />

            <SettingsRow
              icon={ChevronRight}
              title="Change Wave Size"
              subtitle={`Currently ${settings?.batch_size ?? '—'} per wave`}
              onClick={() => { setNewBatchSize(settings?.batch_size ?? 30); setSheet('waveSize'); setError('') }}
              disabled={!settings}
              rightEl={
                <span className="text-xs font-bold px-2 py-1 rounded-md" style={{ backgroundColor: '#F1F5F9', color: MUTED }}>
                  {settings?.batch_size ?? '—'}
                </span>
              }
            />
          </Card>

          {/* CHECK-IN LINK */}
          <Card>
            <CardHeader label="Check-in Link" />
            <div className="px-5 py-4">
              <p className="text-xs mb-3" style={{ color: MUTED }}>
                Share this link with corps members so they can join the queue from their phones.
              </p>
              <div className="flex items-center gap-2 p-3 rounded-xl" style={{ backgroundColor: '#F8FAFC', border: `1px solid ${LINE}` }}>
                <Link2 className="w-4 h-4 flex-shrink-0" style={{ color: MUTED }} />
                <span className="flex-1 text-xs font-mono truncate" style={{ color: INK }}>
                  {window.location.origin}/join
                </span>
                <button
                  onClick={copyLink}
                  className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors active:opacity-70"
                  style={{ backgroundColor: copied ? 'rgba(27,107,58,0.1)' : '#F1F5F9', color: copied ? G : MUTED }}
                >
                  <Copy className="w-3.5 h-3.5" />
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>
          </Card>

        </div>

        {/* ── RIGHT COLUMN ── */}
        <div className="space-y-4">

          {/* LOCATION */}
          <Card>
            <CardHeader label="Location" />

            <div className="flex items-center gap-3 px-5 py-4">
              <MapPin className="w-5 h-5 flex-shrink-0" style={{ color: geoOn ? G : MUTED }} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold" style={{ color: INK }}>Location Check</div>
                <div className="text-xs mt-0.5" style={{ color: MUTED }}>
                  {geoOn ? 'Corps members must be near the venue.' : 'Anyone can check in from any location.'}
                </div>
              </div>
              <button
                onClick={toggleGeofencing}
                disabled={busy || !settings}
                className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-40 flex-shrink-0"
                style={{ backgroundColor: geoOn ? G : '#CBD5E1' }}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${geoOn ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>

            <Divider />

            <SettingsRow
              icon={MapPin}
              title="Update Venue Location"
              subtitle={settings?.venue_lat
                ? `${Number(settings.venue_lat).toFixed(4)}, ${Number(settings.venue_lng).toFixed(4)} · ${settings.venue_radius_m}m radius`
                : 'Set the venue coordinates and allowed radius'}
              onClick={() => {
                if (settings) {
                  setVenueLat(String(settings.venue_lat ?? '6.4360344'))
                  setVenueLng(String(settings.venue_lng ?? '3.523451'))
                  setVenueRadius(String(settings.venue_radius_m ?? '350'))
                  setGeoEnabled(settings.geofencing_enabled ?? true)
                }
                setSheet('location'); setError('')
              }}
              disabled={!settings}
            />
          </Card>

          {/* DATA */}
          <Card>
            <CardHeader label="Data" />
            <SettingsRow
              icon={Download}
              title="Export CSV"
              subtitle="Download today's full registration list"
              onClick={exportCSV}
              disabled={busy}
            />
            <Divider />
            <SettingsRow
              icon={RotateCcw}
              title="Reset Day"
              subtitle="Archive all entries and start fresh"
              onClick={() => { setResetText(''); setSheet('resetDay'); setError('') }}
              disabled={!settings || !adminPin}
              destructive
            />
          </Card>

          <p className="text-center text-xs pb-2" style={{ color: MUTED }}>
            Eti-Osa 3 Special CDS · NYSC Lagos State
          </p>

        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 text-white px-4 py-2 rounded-xl shadow-lg text-sm font-semibold z-50 whitespace-nowrap"
          style={{ backgroundColor: INK }}>
          {toast}
        </div>
      )}

      {/* ══ DIALOGS ══ */}

      {sheet === 'closeSession' && (
        <ConfirmSheet
          title="Close session?"
          body="No new check-ins will be accepted. You can reopen at any time."
          confirmLabel="Close Session"
          destructive
          onCancel={closeSheet}
          onConfirm={toggleRegistration}
          busy={busy}
        >
          {error && <p className="text-xs font-semibold mb-2" style={{ color: DESTRUCTIVE }}>{error}</p>}
        </ConfirmSheet>
      )}

      {sheet === 'newSession' && (
        <ConfirmSheet
          title="Start new session?"
          body="This archives all current entries and resets the queue to 0. Cannot be undone."
          confirmLabel="Start Session"
          onCancel={closeSheet}
          onConfirm={startNewSession}
          busy={busy}
        >
          <div className="mb-3">
            <label className="block text-sm font-semibold mb-1.5" style={{ color: INK }}>
              Wave size <span style={{ color: MUTED }}>(10–100)</span>
            </label>
            <input
              type="number" min={10} max={100}
              value={newBatchSize}
              onChange={e => setNewBatchSize(Number(e.target.value))}
              className="w-full rounded-xl px-4 py-3 text-lg font-bold outline-none border-2 border-slate-200 focus:border-emerald-700"
              style={{ color: INK }}
            />
          </div>
          {error && <p className="text-xs font-semibold mb-2" style={{ color: DESTRUCTIVE }}>{error}</p>}
        </ConfirmSheet>
      )}

      {sheet === 'waveSize' && (
        <ConfirmSheet
          title="Change wave size"
          body="Applies to future registrations only. Existing wave numbers stay the same."
          confirmLabel="Save"
          onCancel={closeSheet}
          onConfirm={changeBatchSize}
          busy={busy}
        >
          <div className="mb-3">
            <input
              type="number" min={10} max={100}
              value={newBatchSize}
              onChange={e => setNewBatchSize(Number(e.target.value))}
              className="w-full rounded-xl px-4 py-3 text-lg font-bold text-center outline-none border-2 border-slate-200 focus:border-emerald-700"
              style={{ color: INK }}
            />
          </div>
          {error && <p className="text-xs font-semibold mb-2" style={{ color: DESTRUCTIVE }}>{error}</p>}
        </ConfirmSheet>
      )}

      {sheet === 'resetDay' && (
        <ConfirmSheet
          title="Reset day?"
          body={`This archives all ${settings ? "today's" : ''} entries. The queue restarts at 1. This cannot be undone.`}
          confirmLabel="Reset Everything"
          destructive
          onCancel={() => { closeSheet(); setResetText('') }}
          onConfirm={resetDay}
          busy={busy}
        >
          <div className="mb-3">
            <label className="block text-xs font-semibold mb-1.5" style={{ color: MUTED }}>
              Type <span className="font-mono bg-slate-100 px-1 rounded">RESET</span> to confirm
            </label>
            <input
              type="text"
              value={resetText}
              onChange={e => setResetText(e.target.value.toUpperCase())}
              placeholder="RESET"
              autoFocus
              className="w-full rounded-xl px-4 py-3 text-lg font-bold text-center font-mono tracking-widest outline-none border-2 border-slate-200 focus:border-red-500"
              style={{ color: INK }}
            />
          </div>
          {error && <p className="text-xs font-semibold mb-2" style={{ color: DESTRUCTIVE }}>{error}</p>}
        </ConfirmSheet>
      )}

      {sheet === 'location' && (
        <ConfirmSheet
          title="Venue Location"
          confirmLabel="Save Location"
          onCancel={closeSheet}
          onConfirm={saveLocation}
          busy={busy}
        >
          <div className="space-y-3 mb-3">
            <div className="flex items-center justify-between py-1">
              <span className="text-sm font-semibold" style={{ color: INK }}>Location check active</span>
              <button
                onClick={() => setGeoEnabled(v => !v)}
                className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
                style={{ backgroundColor: geoEnabled ? G : '#CBD5E1' }}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${geoEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>

            {geoEnabled && (
              <button
                type="button"
                onClick={() => {
                  if (!navigator.geolocation) { setError('Geolocation not supported on this device.'); return }
                  setError(''); setBusy(true)
                  navigator.geolocation.getCurrentPosition(
                    pos => { setVenueLat(pos.coords.latitude.toFixed(7)); setVenueLng(pos.coords.longitude.toFixed(7)); setBusy(false) },
                    () => { setError('Could not get location. Allow GPS and try again.'); setBusy(false) },
                    { enableHighAccuracy: true, timeout: 10000 }
                  )
                }}
                disabled={busy}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-opacity active:opacity-70 disabled:opacity-40"
                style={{ backgroundColor: 'rgba(27,107,58,0.08)', color: G }}
              >
                📍 Use my current location
              </button>
            )}

            <div className={geoEnabled ? '' : 'opacity-50 pointer-events-none'}>
              <label className="block text-xs font-semibold mb-1" style={{ color: MUTED }}>Latitude</label>
              <input
                type="number" step="0.000001"
                value={venueLat}
                onChange={e => setVenueLat(e.target.value)}
                placeholder="e.g. 6.4360344"
                className="w-full rounded-xl px-3.5 py-2.5 text-sm font-mono outline-none border-2 border-slate-200 focus:border-emerald-700"
                style={{ color: INK }}
              />
            </div>
            <div className={geoEnabled ? '' : 'opacity-50 pointer-events-none'}>
              <label className="block text-xs font-semibold mb-1" style={{ color: MUTED }}>Longitude</label>
              <input
                type="number" step="0.000001"
                value={venueLng}
                onChange={e => setVenueLng(e.target.value)}
                placeholder="e.g. 3.523451"
                className="w-full rounded-xl px-3.5 py-2.5 text-sm font-mono outline-none border-2 border-slate-200 focus:border-emerald-700"
                style={{ color: INK }}
              />
            </div>
            <div className={geoEnabled ? '' : 'opacity-50 pointer-events-none'}>
              <label className="block text-xs font-semibold mb-1" style={{ color: MUTED }}>
                Radius (metres) — how far from venue a phone can be
              </label>
              <input
                type="number" min="50" max="2000"
                value={venueRadius}
                onChange={e => setVenueRadius(e.target.value)}
                placeholder="350"
                className="w-full rounded-xl px-3.5 py-2.5 text-sm font-mono outline-none border-2 border-slate-200 focus:border-emerald-700"
                style={{ color: INK }}
              />
              <p className="text-xs mt-1" style={{ color: MUTED }}>
                Tip: 350 m works well. Increase to 500 m if members near the venue are being rejected.
              </p>
            </div>
          </div>
          {error && <p className="text-xs font-semibold mb-2" style={{ color: DESTRUCTIVE }}>{error}</p>}
        </ConfirmSheet>
      )}

    </div>
  )
}
