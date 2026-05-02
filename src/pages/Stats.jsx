import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'

const G    = '#1B6B3A'
const MUTED = '#64748B'
const INK   = '#0F172A'
const LINE  = '#E2E8F0'
const AMBER = '#F59B0A'

export default function StatsPage() {
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

  const [registrations, setRegistrations] = useState([])
  const [settings,      setSettings]      = useState(null)
  const [loading,       setLoading]       = useState(true)

  /* ── Load data ── */
  useEffect(() => {
    async function load() {
      const [{ data: regs }, { data: s }] = await Promise.all([
        supabase.from('registrations').select('id, status, batch_number, created_at'),
        supabase.from('session_settings').select('*').eq('id', 1).single(),
      ])
      setRegistrations(regs || [])
      setSettings(s || null)
      setLoading(false)
    }
    load()

    /* Realtime — refresh on any change */
    const ch = supabase
      .channel('stats-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'registrations' }, () => {
        supabase.from('registrations').select('id, status, batch_number, created_at').then(({ data }) => {
          if (data) setRegistrations(data)
        })
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'session_settings', filter: 'id=eq.1' }, payload => {
        setSettings(payload.new)
      })
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [])

  /* ── Derived stats ── */
  const total    = registrations.length
  const served   = registrations.filter(r => r.status === 'served').length
  const waiting  = registrations.filter(r => r.status === 'waiting' || r.status === 'called').length
  const pct      = total > 0 ? Math.round((served / total) * 100) : 0
  const currentBatch = settings?.current_batch ?? 0

  /* Wave breakdown */
  const waves = {}
  registrations.forEach(r => {
    const b = r.batch_number ?? 0
    if (!waves[b]) waves[b] = { total: 0, served: 0 }
    waves[b].total++
    if (r.status === 'served') waves[b].served++
  })
  const waveKeys = Object.keys(waves).map(Number).sort((a, b) => a - b)

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-5">

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold" style={{ color: INK }}>Session Stats</h1>
        <p className="text-sm mt-0.5" style={{ color: MUTED }}>
          Live progress for today's CDS clearance
        </p>
      </div>

      {loading ? (
        <div className="text-center py-16 text-sm" style={{ color: MUTED }}>Loading stats…</div>
      ) : total === 0 ? (
        <div className="bg-white rounded-2xl p-8 text-center" style={{ border: `1px solid ${LINE}` }}>
          <div className="text-4xl mb-3">📊</div>
          <p className="font-semibold" style={{ color: INK }}>No registrations yet</p>
          <p className="text-sm mt-1" style={{ color: MUTED }}>Stats will appear once corps members start checking in.</p>
        </div>
      ) : (
        <>
          {/* ── Overall progress card ── */}
          <div className="bg-white rounded-2xl p-5" style={{ border: `1px solid ${LINE}` }}>
            <div className="flex items-end justify-between mb-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>Overall Progress</p>
                <p className="text-4xl font-extrabold mt-0.5" style={{ color: INK }}>{pct}%</p>
              </div>
              <p className="text-sm font-semibold pb-1" style={{ color: MUTED }}>
                {served} / {total} served
              </p>
            </div>
            {/* Progress bar */}
            <div className="h-4 rounded-full overflow-hidden" style={{ backgroundColor: LINE }}>
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${pct}%`, backgroundColor: pct === 100 ? AMBER : G }}
              />
            </div>
            {pct === 100 && (
              <p className="text-xs font-bold mt-2 text-center" style={{ color: AMBER }}>
                🎉 All corps members cleared!
              </p>
            )}
          </div>

          {/* ── 2×2 stat grid ── */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Registered', value: total,   color: INK   },
              { label: 'Waiting',    value: waiting,  color: AMBER },
              { label: 'Served',     value: served,   color: G     },
              { label: 'Completion', value: `${pct}%`, color: pct >= 80 ? G : pct >= 50 ? AMBER : MUTED },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-white rounded-2xl p-4" style={{ border: `1px solid ${LINE}` }}>
                <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: MUTED }}>{label}</p>
                <p className="text-2xl font-extrabold" style={{ color }}>{value}</p>
              </div>
            ))}
          </div>

          {/* ── Wave breakdown ── */}
          {waveKeys.length > 0 && (
            <div className="bg-white rounded-2xl overflow-hidden" style={{ border: `1px solid ${LINE}` }}>
              <div className="px-5 py-3 border-b" style={{ borderColor: LINE }}>
                <h2 className="text-xs font-bold uppercase tracking-wider" style={{ color: MUTED }}>Wave Breakdown</h2>
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
                            <span
                              className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                              style={{ backgroundColor: 'rgba(27,107,58,0.1)', color: G }}
                            >
                              Now Serving
                            </span>
                          )}
                          {isDone && !isNow && (
                            <span
                              className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                              style={{ backgroundColor: 'rgba(245,155,10,0.1)', color: AMBER }}
                            >
                              Done ✓
                            </span>
                          )}
                        </div>
                        <span className="text-xs font-semibold" style={{ color: MUTED }}>
                          {wServed}/{wTotal}
                        </span>
                      </div>
                      {/* Mini progress bar */}
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: LINE }}>
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${wPct}%`,
                            backgroundColor: isDone ? AMBER : isNow ? G : '#94A3B8',
                          }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
