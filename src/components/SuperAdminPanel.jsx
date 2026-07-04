import { useEffect, useState } from 'react'
import { ChevronRight, ShieldCheck } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { T } from '../lib/tokens.js'

/* ─────────────────────────────────────────────────────────────────
   SuperAdminPanel
   Admin tools relocated from the Dashboard: approvals, announce,
   activity, sessions, archives, duplicates, venue, renumber queue.
   Self-contained (own state, loaders, toast). Renders nothing for
   non-super-admin users.
───────────────────────────────────────────────────────────────── */
export default function SuperAdminPanel() {
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [tab, setTab] = useState(null) // null = home menu

  const [busy,  setBusy]  = useState(false)
  const [toast, setToast] = useState('')
  const [error, setError] = useState('')

  const [execList,        setExecList]        = useState([])
  const [execListLoading, setExecListLoading] = useState(false)
  const [approvingId,     setApprovingId]     = useState(null)
  const [rejectingId,     setRejectingId]     = useState(null)
  const [rejectReason,    setRejectReason]    = useState('')
  const [showRejectSheet, setShowRejectSheet] = useState(null)

  const [activityLog,  setActivityLog]  = useState([])
  const [execSessions, setExecSessions] = useState([])
  const [archiveDates, setArchiveDates] = useState([])
  const [duplicates,   setDuplicates]   = useState([])
  const [announcement, setAnnouncement] = useState('')

  const [venueGeoEnabled, setVenueGeoEnabled] = useState(true)
  const [venueLat,    setVenueLat]    = useState('')
  const [venueLng,    setVenueLng]    = useState('')
  const [venueRadius, setVenueRadius] = useState('')
  const [venueSuccess, setVenueSuccess] = useState('')

  function flash(msg) { setToast(msg); setTimeout(() => setToast(''), 3000) }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const superAdmin = session?.user?.user_metadata?.role === 'super_admin'
      setIsSuperAdmin(superAdmin)
      if (superAdmin) loadExecList()
    })
  }, [])

  // Prefill announcement + venue from settings when those tabs open
  useEffect(() => {
    if (!tab) return
    if (tab === 'approvals')  loadExecList()
    if (tab === 'log')        loadActivityLog()
    if (tab === 'sessions')   loadExecSessions()
    if (tab === 'archives')   loadArchiveDates()
    if (tab === 'duplicates') loadDuplicates()
    if (tab === 'announce' || tab === 'venue') {
      supabase.from('session_settings').select('*').eq('id', 1).single().then(({ data: s }) => {
        if (!s) return
        if (tab === 'announce') setAnnouncement(s.announcement || '')
        if (tab === 'venue') {
          setVenueGeoEnabled(s.geofencing_enabled ?? true)
          setVenueLat(String(s.venue_lat ?? ''))
          setVenueLng(String(s.venue_lng ?? ''))
          setVenueRadius(String(s.venue_radius_m ?? ''))
        }
      })
    }
  }, [tab])

  async function loadExecList() {
    setExecListLoading(true)
    try {
      const { data } = await supabase.rpc('super_admin_list_execs')
      if (data) setExecList(data)
    } catch {} finally { setExecListLoading(false) }
  }

  async function approveExec(userId) {
    setApprovingId(userId)
    try {
      const { error: e } = await supabase.rpc('super_admin_approve_exec', { p_user_id: userId })
      if (e) throw e
      setExecList(prev => prev.map(p => p.id === userId ? { ...p, status: 'approved', reviewed_at: new Date().toISOString(), rejection_reason: null } : p))
      flash('Access approved.')
    } catch (e) { setError(e?.message || 'Could not approve.') } finally { setApprovingId(null) }
  }

  async function rejectExec(userId) {
    setRejectingId(userId)
    try {
      const { error: e } = await supabase.rpc('super_admin_reject_exec', { p_user_id: userId, p_reason: rejectReason.trim() })
      if (e) throw e
      setExecList(prev => prev.map(p => p.id === userId ? { ...p, status: 'rejected', reviewed_at: new Date().toISOString(), rejection_reason: rejectReason.trim() } : p))
      flash('Access rejected.')
      setShowRejectSheet(null)
      setRejectReason('')
    } catch (e) { setError(e?.message || 'Could not reject.') } finally { setRejectingId(null) }
  }

  async function loadActivityLog() {
    try {
      const { data } = await supabase.rpc('super_admin_get_activity_log', { p_limit: 100 })
      if (data) setActivityLog(data)
    } catch {}
  }

  async function loadExecSessions() {
    try {
      const { data } = await supabase.rpc('super_admin_get_active_sessions')
      if (data) setExecSessions(data)
    } catch {}
  }

  async function loadArchiveDates() {
    try {
      const { data } = await supabase.rpc('super_admin_get_archive_dates')
      if (data) setArchiveDates(data)
    } catch {}
  }

  async function loadDuplicates() {
    try {
      const { data } = await supabase.rpc('super_admin_find_duplicates')
      if (data) setDuplicates(data)
    } catch {}
  }

  async function saveAnnouncement() {
    setBusy(true); setError('')
    try {
      const { error: e } = await supabase.rpc('super_admin_set_announcement', { p_announcement: announcement })
      if (e) throw e
      flash(announcement ? 'Announcement published to all status pages.' : 'Announcement cleared.')
    } catch (e) { setError(e?.message || 'Could not save announcement.') } finally { setBusy(false) }
  }

  async function superRenumberQueue() {
    setBusy(true); setError('')
    try {
      const { data, error: e } = await supabase.rpc('super_admin_renumber_queue')
      if (e) throw e
      flash(`Queue renumbered. ${data} entries updated from #1.`)
    } catch (e) { setError(e?.message || 'Could not renumber queue.') } finally { setBusy(false) }
  }

  async function saveVenueSettings() {
    const lat = parseFloat(venueLat)
    const lng = parseFloat(venueLng)
    const radius = parseInt(venueRadius, 10)
    if (isNaN(lat) || isNaN(lng) || isNaN(radius) || radius < 50) {
      setError('Invalid coordinates or radius (minimum 50m).')
      return
    }
    setBusy(true); setError(''); setVenueSuccess('')
    try {
      const { error: e } = await supabase.rpc('super_admin_update_geo_settings', {
        p_geofencing_enabled: venueGeoEnabled,
        p_venue_lat:          lat,
        p_venue_lng:          lng,
        p_venue_radius_m:     radius,
      })
      if (e) throw e
      setVenueSuccess('Venue settings saved.')
      setTimeout(() => setVenueSuccess(''), 3000)
    } catch (e) { setError(e?.message || 'Could not save venue settings.') } finally { setBusy(false) }
  }

  if (!isSuperAdmin) return null

  const pendingCount = execList.filter(p => p.status === 'pending').length
  const tabMeta = {
    approvals:  { icon: '👤', label: 'Approvals',  desc: pendingCount > 0 ? `${pendingCount} pending` : 'Manage exec accounts' },
    announce:   { icon: '📢', label: 'Announce',   desc: 'Broadcast to all members' },
    log:        { icon: '📋', label: 'Activity',   desc: 'Recent admin actions' },
    sessions:   { icon: '🔑', label: 'Sessions',   desc: 'Active exec logins' },
    archives:   { icon: '🗄', label: 'Archives',   desc: 'Past session records' },
    duplicates: { icon: '⚠️', label: 'Duplicates', desc: 'Flag suspicious entries' },
    venue:      { icon: '📍', label: 'Venue',      desc: 'Location and geofence' },
  }

  const statusColors = (status) => ({
    backgroundColor: status === 'approved' ? T.servedTint : status === 'rejected' ? T.dangerTint : T.goldTint,
    color:           status === 'approved' ? T.served     : status === 'rejected' ? T.danger     : T.gold,
  })

  return (
    <div className="rounded-2xl overflow-hidden bg-surface-raised" style={{ border: `1px solid ${T.line}` }}>

      {/* Header: neutral surface, brand tint accent */}
      <div className="px-4 py-3 flex items-center gap-3" style={{ borderBottom: `1px solid ${T.line}` }}>
        {tab ? (
          <button
            onClick={() => setTab(null)}
            aria-label="Back to admin tools"
            className="w-11 h-11 -my-2 flex items-center justify-center rounded-xl"
            style={{ color: T.textSecondary }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
          </button>
        ) : (
          <span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: T.brandTint }}>
            <ShieldCheck className="w-4 h-4" style={{ color: T.brand }} />
          </span>
        )}
        <span className="font-bold text-sm flex-1" style={{ color: T.textPrimary }}>
          {tab ? tabMeta[tab]?.label : 'Super Admin Tools'}
        </span>
        {pendingCount > 0 && !tab && (
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: T.dangerTint, color: T.danger }}>
            {pendingCount}
          </span>
        )}
      </div>

      {error && (
        <div className="px-4 py-2 text-xs font-semibold" style={{ backgroundColor: T.dangerTint, color: T.danger }}>
          {error}
        </div>
      )}

      {/* Home menu */}
      {!tab && (
        <div className="p-3 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {(['announce', 'venue']).map(key => (
              <button key={key} onClick={() => setTab(key)}
                className="flex flex-col items-start gap-1 p-3 rounded-xl text-left transition-colors active:opacity-70 min-h-[44px]"
                style={{ backgroundColor: T.surface, border: `1px solid ${T.line}` }}>
                <span className="text-xl">{tabMeta[key].icon}</span>
                <span className="text-sm font-bold" style={{ color: T.textPrimary }}>{tabMeta[key].label}</span>
                <span className="text-[11px] leading-tight" style={{ color: T.textSecondary }}>{tabMeta[key].desc}</span>
              </button>
            ))}
          </div>

          <button
            onClick={superRenumberQueue}
            disabled={busy}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-colors active:opacity-70 disabled:opacity-40 min-h-[44px]"
            style={{ backgroundColor: T.waitingTint, border: `1px solid ${T.waiting}` }}
          >
            <span className="text-lg">🔢</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold" style={{ color: T.waiting }}>Renumber Queue</div>
              <div className="text-[11px]" style={{ color: T.waiting }}>Close gaps and reassign numbers from #1 in order</div>
            </div>
          </button>

          <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${T.line}` }}>
            {(['approvals', 'log', 'sessions', 'archives', 'duplicates']).map((key, i, arr) => (
              <button key={key} onClick={() => setTab(key)}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors active:opacity-70 min-h-[44px]"
                style={{ borderBottom: i < arr.length - 1 ? `1px solid ${T.line}` : 'none' }}>
                <span className="text-lg w-6 flex-shrink-0">{tabMeta[key].icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold" style={{ color: T.textPrimary }}>{tabMeta[key].label}</div>
                  <div className="text-[11px] mt-0.5" style={{ color: T.textSecondary }}>{tabMeta[key].desc}</div>
                </div>
                {key === 'approvals' && pendingCount > 0 && (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full flex-shrink-0" style={{ backgroundColor: T.dangerTint, color: T.danger }}>
                    {pendingCount}
                  </span>
                )}
                <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: T.textSecondary }} />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Approvals */}
      {tab === 'approvals' && (
        <div>
          <div className="px-4 pt-3 pb-1 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wide" style={{ color: T.textSecondary }}>Exec Access Requests</span>
            <button onClick={loadExecList} disabled={execListLoading} className="text-xs font-semibold min-h-[44px] px-2" style={{ color: T.brand }}>
              {execListLoading ? 'Loading…' : 'Refresh'}
            </button>
          </div>
          {execListLoading && <div className="py-8 text-center text-sm" style={{ color: T.textSecondary }}>Loading…</div>}
          {!execListLoading && execList.length === 0 && <div className="py-8 text-center text-sm" style={{ color: T.textSecondary }}>No exec accounts found.</div>}
          {!execListLoading && execList.length > 0 && (
            <div className="divide-y" style={{ borderColor: T.line }}>
              {execList.map(p => (
                <div key={p.id} className="px-4 py-3">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0" style={statusColors(p.status)}>
                      {(p.full_name || p.email || '?')[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold truncate" style={{ color: T.textPrimary }}>{p.full_name || '(no name)'}</span>
                        <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full flex-shrink-0" style={statusColors(p.status)}>
                          {p.status}
                        </span>
                      </div>
                      <div className="text-xs mt-0.5 truncate" style={{ color: T.textSecondary }}>{p.email}</div>
                      <div className="text-xs mt-0.5 font-mono" style={{ color: T.textSecondary }}>{p.state_code || 'no code'} · {p.role}</div>
                      {p.rejection_reason && <div className="text-xs mt-1 italic" style={{ color: T.danger }}>Reason: {p.rejection_reason}</div>}
                    </div>
                  </div>
                  {p.status === 'pending' && (
                    <div className="flex gap-2 mt-2.5 pl-12">
                      <button onClick={() => approveExec(p.id)} disabled={approvingId === p.id || rejectingId === p.id}
                        className="flex-1 py-2.5 rounded-lg text-xs font-bold transition-opacity disabled:opacity-40 min-h-[44px]"
                        style={{ backgroundColor: T.brand, color: T.onBrand }}>
                        {approvingId === p.id ? 'Approving…' : '✓ Approve'}
                      </button>
                      <button onClick={() => { setShowRejectSheet(p.id); setRejectReason('') }} disabled={approvingId === p.id || rejectingId === p.id}
                        className="flex-1 py-2.5 rounded-lg text-xs font-bold transition-opacity disabled:opacity-40 min-h-[44px]"
                        style={{ backgroundColor: T.dangerTint, color: T.danger }}>
                        ✕ Reject
                      </button>
                    </div>
                  )}
                  {p.status === 'approved' && (
                    <div className="mt-2.5 pl-12">
                      <button onClick={() => { setShowRejectSheet(p.id); setRejectReason('') }} disabled={rejectingId === p.id}
                        className="px-3 py-2.5 rounded-lg text-xs font-semibold transition-opacity disabled:opacity-40 min-h-[44px]"
                        style={{ backgroundColor: T.dangerTint, color: T.danger }}>
                        Revoke access
                      </button>
                    </div>
                  )}
                  {p.status === 'rejected' && (
                    <div className="mt-2.5 pl-12">
                      <button onClick={() => approveExec(p.id)} disabled={approvingId === p.id}
                        className="px-3 py-2.5 rounded-lg text-xs font-semibold transition-opacity disabled:opacity-40 min-h-[44px]"
                        style={{ backgroundColor: T.brand, color: T.onBrand }}>
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

      {/* Announce */}
      {tab === 'announce' && (
        <div className="p-4 space-y-3">
          <p className="text-xs" style={{ color: T.textSecondary }}>This message appears as a banner on every corps member's status page.</p>
          <textarea
            value={announcement}
            onChange={e => setAnnouncement(e.target.value)}
            rows={3}
            maxLength={200}
            placeholder="e.g. Wave 3 is now being called. Please proceed to the clearance desk."
            className="w-full rounded-xl px-3.5 py-3 text-sm outline-none resize-none"
            style={{ border: `1.5px solid ${T.line}`, color: T.textPrimary }}
          />
          <div className="flex gap-2">
            <button onClick={saveAnnouncement} disabled={busy}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-opacity active:opacity-80 disabled:opacity-50 min-h-[44px]"
              style={{ backgroundColor: T.brand, color: T.onBrand }}>
              {announcement ? 'Publish' : 'Clear announcement'}
            </button>
            {announcement && (
              <button onClick={() => { setAnnouncement(''); saveAnnouncement() }} disabled={busy}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold transition-opacity active:opacity-80 min-h-[44px]"
                style={{ backgroundColor: T.dangerTint, color: T.danger }}>
                Clear
              </button>
            )}
          </div>
        </div>
      )}

      {/* Activity */}
      {tab === 'log' && (
        <div>
          <div className="px-4 pt-3 pb-1 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wide" style={{ color: T.textSecondary }}>Recent Actions</span>
            <button onClick={loadActivityLog} className="text-xs font-semibold min-h-[44px] px-2" style={{ color: T.brand }}>Refresh</button>
          </div>
          {activityLog.length === 0
            ? <div className="py-8 text-center text-sm" style={{ color: T.textSecondary }}>No activity yet.</div>
            : <div className="divide-y max-h-72 overflow-y-auto" style={{ borderColor: T.line }}>
                {activityLog.map((item, i) => (
                  <div key={i} className="px-4 py-2.5 flex items-start gap-3">
                    <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: T.brand }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium" style={{ color: T.textPrimary }}>{item.action?.replace(/_/g, ' ')}</div>
                      {item.details && <div className="text-xs mt-0.5" style={{ color: T.textSecondary }}>{item.details}</div>}
                    </div>
                    <div className="text-[11px] flex-shrink-0" style={{ color: T.textSecondary }}>
                      {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                ))}
              </div>
          }
        </div>
      )}

      {/* Sessions */}
      {tab === 'sessions' && (
        <div>
          <div className="px-4 pt-3 pb-1 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wide" style={{ color: T.textSecondary }}>Active Logins</span>
            <button onClick={loadExecSessions} className="text-xs font-semibold min-h-[44px] px-2" style={{ color: T.brand }}>Refresh</button>
          </div>
          {execSessions.length === 0
            ? <div className="py-8 text-center text-sm" style={{ color: T.textSecondary }}>No active sessions.</div>
            : <div className="divide-y" style={{ borderColor: T.line }}>
                {execSessions.map((s, i) => (
                  <div key={i} className="px-4 py-3 flex items-center justify-between">
                    <div className="text-sm font-medium capitalize" style={{ color: T.textPrimary }}>{s.page?.replace('/', '') || 'Unknown page'}</div>
                    <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ backgroundColor: T.brandTint, color: T.brand }}>
                      {s.device_count} active
                    </span>
                  </div>
                ))}
              </div>
          }
        </div>
      )}

      {/* Archives */}
      {tab === 'archives' && (
        <div>
          <div className="px-4 pt-3 pb-1 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wide" style={{ color: T.textSecondary }}>Past Sessions</span>
            <button onClick={loadArchiveDates} className="text-xs font-semibold min-h-[44px] px-2" style={{ color: T.brand }}>Refresh</button>
          </div>
          {archiveDates.length === 0
            ? <div className="py-8 text-center text-sm" style={{ color: T.textSecondary }}>No archived sessions yet.</div>
            : <div className="divide-y" style={{ borderColor: T.line }}>
                {archiveDates.map((a, i) => (
                  <div key={i} className="px-4 py-3 flex items-center justify-between">
                    <div className="text-sm font-medium" style={{ color: T.textPrimary }}>
                      {new Date(a.session_date).toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                    </div>
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ backgroundColor: T.sunken, color: T.textSecondary }}>
                      {a.entry_count} members
                    </span>
                  </div>
                ))}
              </div>
          }
        </div>
      )}

      {/* Duplicates */}
      {tab === 'duplicates' && (
        <div>
          <div className="px-4 pt-3 pb-1 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wide" style={{ color: T.textSecondary }}>Duplicate Entries</span>
            <button onClick={loadDuplicates} className="text-xs font-semibold min-h-[44px] px-2" style={{ color: T.brand }}>Refresh</button>
          </div>
          {duplicates.length === 0
            ? <div className="py-8 text-center text-sm" style={{ color: T.textSecondary }}>No duplicates found.</div>
            : <div className="divide-y" style={{ borderColor: T.line }}>
                {duplicates.map((d, i) => (
                  <div key={i} className="px-4 py-3 flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: T.dangerTint }}>
                      <span className="text-sm">⚠️</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold" style={{ color: T.textPrimary }}>{d.full_name}</div>
                      <div className="text-xs font-mono mt-0.5" style={{ color: T.textSecondary }}>{d.state_code}</div>
                    </div>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0" style={{ backgroundColor: T.dangerTint, color: T.danger }}>
                      ×{d.match_count}
                    </span>
                  </div>
                ))}
              </div>
          }
        </div>
      )}

      {/* Venue */}
      {tab === 'venue' && (
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between p-3 rounded-xl" style={{ backgroundColor: T.surface, border: `1px solid ${T.line}` }}>
            <div>
              <div className="text-sm font-semibold" style={{ color: T.textPrimary }}>Geofencing</div>
              <div className="text-xs mt-0.5" style={{ color: T.textSecondary }}>Require corps members to be at venue</div>
            </div>
            <button onClick={() => setVenueGeoEnabled(v => !v)}
              role="switch" aria-checked={venueGeoEnabled} aria-label="Geofencing"
              className="w-11 h-6 rounded-full transition-colors flex-shrink-0"
              style={{ backgroundColor: venueGeoEnabled ? T.brand : T.line }}>
              <div className="w-4 h-4 rounded-full shadow transition-transform mx-1"
                style={{ backgroundColor: T.raised, transform: venueGeoEnabled ? 'translateX(18px)' : 'translateX(0)' }} />
            </button>
          </div>
          {venueGeoEnabled && (
            <div className="space-y-2">
              {[
                { label: 'Latitude', value: venueLat, set: setVenueLat, placeholder: '6.4360344' },
                { label: 'Longitude', value: venueLng, set: setVenueLng, placeholder: '3.523451' },
                { label: 'Radius (metres)', value: venueRadius, set: setVenueRadius, placeholder: '350' },
              ].map(({ label, value, set, placeholder }) => (
                <div key={label}>
                  <label className="block text-xs font-semibold mb-1" style={{ color: T.textSecondary }}>{label}</label>
                  <input type="text" value={value} onChange={e => set(e.target.value)} placeholder={placeholder}
                    className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none font-mono min-h-[44px]"
                    style={{ border: `1.5px solid ${T.line}`, color: T.textPrimary }} />
                </div>
              ))}
            </div>
          )}
          {venueSuccess && <div className="text-xs font-semibold text-center py-2 rounded-lg" style={{ backgroundColor: T.servedTint, color: T.served }}>{venueSuccess}</div>}
          <button onClick={saveVenueSettings} disabled={busy}
            className="w-full py-2.5 rounded-xl text-sm font-bold transition-opacity active:opacity-80 disabled:opacity-50 min-h-[44px]"
            style={{ backgroundColor: T.brand, color: T.onBrand }}>
            Save venue settings
          </button>
        </div>
      )}

      {/* Reject / revoke sheet */}
      {showRejectSheet && (
        <div className="fixed inset-0 z-[100]">
          <div className="absolute inset-0" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }} onClick={() => setShowRejectSheet(null)} />
          <div className="absolute bottom-0 left-0 right-0 rounded-t-2xl px-5 pt-5" style={{ backgroundColor: T.raised, paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}>
            <div className="w-10 h-1 rounded-full mx-auto mb-4" style={{ backgroundColor: T.line }} />
            <h3 className="text-base font-bold mb-1" style={{ color: T.textPrimary }}>
              {execList.find(p => p.id === showRejectSheet)?.status === 'approved' ? 'Revoke access' : 'Reject access request'}
            </h3>
            <p className="text-sm mb-3" style={{ color: T.textSecondary }}>
              Optional: give a reason (the exec will see this).
            </p>
            <textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder="e.g. Not a registered exec for this CDS group."
              rows={3}
              className="w-full rounded-xl px-3.5 py-3 text-sm outline-none resize-none"
              style={{ border: `1.5px solid ${T.line}`, color: T.textPrimary }}
            />
            <div className="flex gap-3 mt-3">
              <button
                onClick={() => setShowRejectSheet(null)}
                className="flex-1 py-3 rounded-xl text-sm font-semibold min-h-[44px]"
                style={{ border: `1px solid ${T.line}`, color: T.textPrimary }}
              >
                Cancel
              </button>
              <button
                onClick={() => rejectExec(showRejectSheet)}
                disabled={rejectingId === showRejectSheet}
                className="flex-1 py-3 rounded-xl text-sm font-bold disabled:opacity-50 min-h-[44px]"
                style={{ backgroundColor: T.dangerTint, color: T.danger, border: `1px solid ${T.danger}` }}
              >
                {rejectingId === showRejectSheet ? 'Please wait…' : 'Confirm reject'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 px-4 py-2 rounded-xl shadow-lg text-sm font-semibold z-50" style={{ backgroundColor: T.textPrimary, color: T.raised }}>
          {toast}
        </div>
      )}
    </div>
  )
}
