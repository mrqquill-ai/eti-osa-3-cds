import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Zap, Clock, TrendingUp, Users, BarChart2, Award } from 'lucide-react'
import { supabase } from '../lib/supabase.js'

const G     = '#1B6B3A'
const MUTED = '#64748B'
const INK   = '#0F172A'
const LINE  = '#E2E8F0'
const AMBER = '#F59B0A'
const RED   = '#C0392B'

/* ── Format minutes into "2h 15m" or "45 min" ── */
function fmtMins(mins) {
  if (!mins || mins < 1) return '< 1 min'
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60), m = mins % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

/* ── Health config ── */
function healthConfig(servedPerHour, started) {
  if (!started)           return { label: 'Not started', dot: '#94A3B8', bg: '#F8FAFC',      text: MUTED   }
  if (servedPerHour >= 30) return { label: 'Great pace',  dot: G,         bg: 'rgba(27,107,58,0.07)',  text: G     }
  if (servedPerHour >= 15) return { label: 'Good pace',   dot: '#22C55E', bg: 'rgba(34,197,94,0.08)',  text: '#15803D' }
  if (servedPerHour >= 5)  return { label: 'Slow pace',   dot: AMBER,     bg: 'rgba(245,155,10,0.08)', text: '#92640A' }
  return                          { label: 'Very slow',   dot: RED,       bg: 'rgba(192,57,43,0.07)',  text: RED   }
}

export default function StatsPage() {
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

  const [registrations, setRegistrations] = useState([])
  const [settings,      setSettings]      = useState(null)
  const [loading,       setLoading]       = useState(true)

  useEffect(() => {
    async function load() {
      const [{ data: regs }, { data: s }] = await Promise.all([
        supabase.from('registrations').select('id, served_at, voided, batch_number, registered_at'),
        supabase.from('session_settings').select('*').eq('id', 1).single(),
      ])
      setRegistrations(regs || [])
      setSettings(s || null)
      setLoading(false)
    }
    load()

    const ch = supabase
      .channel('stats-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'registrations' }, () => {
        supabase.from('registrations').select('id, served_at, voided, batch_number, registered_at')
          .then(({ data }) => { if (data) setRegistrations(data) })
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'session_settings', filter: 'id=eq.1' },
        payload => setSettings(payload.new))
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [])

  /* ── Derived stats ── */
  const active       = registrations.filter(r => !r.voided)
  const total        = active.length
  const servedItems  = active.filter(r => !!r.served_at)
  const served       = servedItems.length
  const waiting      = total - served
  const pct          = total > 0 ? Math.round((served / total) * 100) : 0
  const currentBatch = settings?.current_batch ?? 0

  /* Velocity */
  const { servedPerHour, minRemaining } = useMemo(() => {
    if (served === 0) return { servedPerHour: 0, minRemaining: null }
    const sorted = [...servedItems].sort((a, b) => new Date(a.served_at) - new Date(b.served_at))
    const firstAt = new Date(sorted[0].served_at)
    const hoursElapsed = (Date.now() - firstAt) / (1000 * 60 * 60)
    const rate = hoursElapsed > 0.02 ? Math.round(served / hoursElapsed) : 0
    const mins = rate > 0 ? Math.round((waiting / rate) * 60) : null
    return { servedPerHour: rate, minRemaining: mins }
  }, [served, waiting, servedItems])

  const health = healthConfig(servedPerHour, served > 0)

  /* Wave breakdown */
  const waves = {}
  active.forEach(r => {
    const b = r.batch_number ?? 0
    if (!waves[b]) waves[b] = { total: 0, served: 0 }
    waves[b].total++
    if (r.served_at) waves[b].served++
  })
  const waveKeys = Object.keys(waves).map(Number).sort((a, b) => a - b)

  /* ─────────────────────── RENDER ─────────────────────── */
  return (
    <div className="max-w-lg mx-auto px-4 py-6 lg:max-w-5xl lg:px-8 lg:py-8">

      {/* Header */}
      <div className="mb-5 lg:mb-6">
        <h1 className="text-xl font-bold" style={{ color: INK }}>Session Stats</h1>
        <p className="text-sm mt-0.5" style={{ color: MUTED }}>Live progress for today's CDS clearance</p>
      </div>

      {loading ? (
        <div className="text-center py-16 text-sm" style={{ color: MUTED }}>Loading stats…</div>
      ) : total === 0 ? (
        <div className="bg-white rounded-2xl p-10 text-center" style={{ border: `1px solid ${LINE}` }}>
          <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: "rgba(100,116,139,0.10)" }} aria-hidden="true"><BarChart2 className="w-7 h-7" style={{ color: "#64748B" }} /></div>
          <p className="font-semibold text-base" style={{ color: INK }}>No registrations yet</p>
          <p className="text-sm mt-1.5" style={{ color: MUTED }}>
            Stats will appear once corps members start checking in.
          </p>
        </div>
      ) : (
        <div className="space-y-5">

          {/* ══ TOP: 4-column metric strip ══ */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { icon: Users,     label: 'Registered', value: total,         sub: 'total today',        color: INK,   bg: 'rgba(15,23,42,0.05)'       },
              { icon: Clock,     label: 'Waiting',    value: waiting,       sub: 'yet to be served',   color: AMBER, bg: 'rgba(245,155,10,0.07)'      },
              { icon: TrendingUp,label: 'Served',     value: served,        sub: 'cleared so far',     color: G,     bg: 'rgba(27,107,58,0.07)'       },
              { icon: Zap,       label: 'Pace',       value: served > 0 ? `${servedPerHour}/hr` : '—', sub: health.label, color: health.text, bg: health.bg },
            ].map(({ icon: Icon, label, value, sub, color, bg }) => (
              <div key={label} className="bg-white rounded-2xl p-4" style={{ border: `1px solid ${LINE}` }}>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: MUTED }}>{label}</p>
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: bg }}>
                    <Icon className="w-3.5 h-3.5" style={{ color }} />
                  </div>
                </div>
                <p className="text-3xl font-extrabold leading-none" style={{ color }}>{value}</p>
                <p className="text-xs mt-1.5 font-medium" style={{ color: MUTED }}>{sub}</p>
              </div>
            ))}
          </div>

          {/* ══ MAIN: two-column on desktop ══ */}
          <div className="lg:grid lg:grid-cols-2 lg:gap-5 space-y-5 lg:space-y-0">

            {/* ── LEFT ── */}
            <div className="space-y-4">

              {/* Overall progress */}
              <div className="bg-white rounded-2xl p-5" style={{ border: `1px solid ${LINE}` }}>
                <div className="flex items-end justify-between mb-1">
                  <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: MUTED }}>Overall Progress</p>
                  <p className="text-xs font-semibold" style={{ color: MUTED }}>{served} / {total} served</p>
                </div>
                <p className="text-5xl font-extrabold leading-none mt-1 mb-4" style={{ color: pct === 100 ? AMBER : INK }}>
                  {pct}%
                </p>
                {/* Progress bar */}
                <div className="h-3 rounded-full overflow-hidden" style={{ backgroundColor: LINE }}>
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${pct}%`, backgroundColor: pct === 100 ? AMBER : G }}
                  />
                </div>
                {pct === 100 ? (
                  <p className="text-xs font-bold mt-3 text-center" style={{ color: AMBER }}>
                    <Award className="w-4 h-4 inline-block mr-1 -mt-0.5" aria-hidden="true" />All corps members cleared!
                  </p>
                ) : (
                  <div className="flex items-center justify-between mt-3 text-xs font-medium" style={{ color: MUTED }}>
                    <span>{waiting} remaining</span>
                    {minRemaining !== null && (
                      <span>~{fmtMins(minRemaining)} to clear</span>
                    )}
                  </div>
                )}
              </div>

              {/* Wave timeline */}
              {waveKeys.length > 0 && (
                <div className="bg-white rounded-2xl p-5" style={{ border: `1px solid ${LINE}` }}>
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: MUTED }}>
                      Wave Timeline
                    </p>
                    <p className="text-[11px] font-semibold" style={{ color: MUTED }}>
                      {waveKeys.length} wave{waveKeys.length !== 1 ? 's' : ''}
                      {waveKeys.length > 6 ? ' · scroll →' : ''}
                    </p>
                  </div>
                  <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
                    {waveKeys.map(wave => {
                      const { total: wTotal, served: wServed } = waves[wave]
                      const isDone = wServed === wTotal && wTotal > 0
                      const isNow  = wave === currentBatch
                      const wPct   = wTotal > 0 ? (wServed / wTotal) * 100 : 0
                      const barColor = isDone ? AMBER : isNow ? G : '#CBD5E1'
                      const labelColor = isDone ? AMBER : isNow ? G : MUTED

                      return (
                        <div key={wave} className="flex-shrink-0" style={{ width: '46px' }}>
                          {/* Progress bar block */}
                          <div className="relative h-12 rounded-xl overflow-hidden" style={{ backgroundColor: '#F1F5F9' }}>
                            <div
                              className="absolute left-0 bottom-0 right-0 rounded-b-xl transition-all duration-700"
                              style={{ height: `${wPct}%`, backgroundColor: barColor, opacity: 0.3 }}
                            />
                            {isNow && (
                              <div className="absolute inset-0 animate-pulse rounded-xl"
                                style={{ backgroundColor: G, opacity: 0.08 }} />
                            )}
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                              <span className="text-[11px] font-extrabold leading-none" style={{ color: labelColor }}>
                                {wave}
                              </span>
                              {isNow && (
                                <span className="text-[7px] font-bold uppercase tracking-wide mt-0.5" style={{ color: G }}>
                                  now
                                </span>
                              )}
                            </div>
                          </div>
                          {/* Served count */}
                          <p className="text-center text-[9px] font-semibold mt-1" style={{ color: labelColor }}>
                            {wServed}/{wTotal}
                          </p>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* ── RIGHT ── */}
            <div className="space-y-4">

              {/* Session velocity card */}
              <div className="bg-white rounded-2xl p-5 space-y-4" style={{ border: `1px solid ${LINE}` }}>
                <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: MUTED }}>Session Velocity</p>

                {served === 0 ? (
                  <div className="py-4 text-center">
                    <Clock className="w-8 h-8 mx-auto mb-2" style={{ color: LINE }} />
                    <p className="text-sm font-semibold" style={{ color: MUTED }}>Session hasn't started yet</p>
                    <p className="text-xs mt-1" style={{ color: '#94A3B8' }}>Velocity appears once members are being served</p>
                  </div>
                ) : (
                  <>
                    {/* Health pill */}
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ backgroundColor: health.bg }}>
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: health.dot }} />
                      <span className="text-sm font-bold" style={{ color: health.text }}>{health.label}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      {/* Served per hour */}
                      <div className="rounded-xl p-3.5" style={{ backgroundColor: '#F8FAFC', border: `1px solid ${LINE}` }}>
                        <div className="flex items-center gap-1.5 mb-1">
                          <Zap className="w-3.5 h-3.5" style={{ color: G }} />
                          <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: MUTED }}>Rate</p>
                        </div>
                        <p className="text-2xl font-extrabold" style={{ color: G }}>{servedPerHour}</p>
                        <p className="text-xs mt-0.5 font-medium" style={{ color: MUTED }}>per hour</p>
                      </div>

                      {/* Est. time remaining */}
                      <div className="rounded-xl p-3.5" style={{ backgroundColor: '#F8FAFC', border: `1px solid ${LINE}` }}>
                        <div className="flex items-center gap-1.5 mb-1">
                          <Clock className="w-3.5 h-3.5" style={{ color: AMBER }} />
                          <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: MUTED }}>Est. left</p>
                        </div>
                        <p className="text-xl font-extrabold leading-tight" style={{ color: AMBER }}>
                          {minRemaining !== null ? fmtMins(minRemaining) : '—'}
                        </p>
                        <p className="text-xs mt-0.5 font-medium" style={{ color: MUTED }}>to clear queue</p>
                      </div>
                    </div>

                    {/* Mini progress sentence */}
                    <p className="text-xs font-medium leading-relaxed rounded-xl px-3 py-2.5"
                      style={{ backgroundColor: '#F8FAFC', color: MUTED, border: `1px solid ${LINE}` }}>
                      At this pace, {waiting} waiting member{waiting !== 1 ? 's' : ''} will be cleared
                      in approximately <span className="font-bold" style={{ color: INK }}>
                        {minRemaining !== null ? fmtMins(minRemaining) : 'an unknown time'}
                      </span>.
                    </p>
                  </>
                )}
              </div>

              {/* Wave breakdown list */}
              {waveKeys.length > 0 && (
                <div className="bg-white rounded-2xl overflow-hidden" style={{ border: `1px solid ${LINE}` }}>
                  <div className="px-5 py-3 border-b" style={{ borderColor: LINE }}>
                    <h2 className="text-[11px] font-bold uppercase tracking-wider" style={{ color: MUTED }}>Wave Breakdown</h2>
                  </div>
                  <div className="divide-y" style={{ borderColor: LINE }}>
                    {waveKeys.map(wave => {
                      const { total: wTotal, served: wServed } = waves[wave]
                      const wPct   = wTotal > 0 ? Math.round((wServed / wTotal) * 100) : 0
                      const isNow  = wave === currentBatch
                      const isDone = wServed === wTotal && wTotal > 0

                      return (
                        <div key={wave} className="px-5 py-3.5">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold" style={{ color: INK }}>
                                {wave === 0 ? 'Pre-session' : `Wave ${wave}`}
                              </span>
                              {isNow && (
                                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                                  style={{ backgroundColor: 'rgba(27,107,58,0.1)', color: G }}>
                                  Now Serving
                                </span>
                              )}
                              {isDone && !isNow && (
                                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                                  style={{ backgroundColor: 'rgba(245,155,10,0.1)', color: AMBER }}>
                                  Done ✓
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold" style={{ color: isDone ? AMBER : isNow ? G : MUTED }}>
                                {wPct}%
                              </span>
                              <span className="text-xs" style={{ color: MUTED }}>{wServed}/{wTotal}</span>
                            </div>
                          </div>
                          <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: LINE }}>
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{ width: `${wPct}%`, backgroundColor: isDone ? AMBER : isNow ? G : '#94A3B8' }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      )}

    </div>
  )
}
