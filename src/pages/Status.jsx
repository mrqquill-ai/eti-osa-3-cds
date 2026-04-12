import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'

export default function Status() {
  const { stateCode } = useParams()
  const code = (stateCode || '').toUpperCase()

  const [reg, setReg] = useState(null)
  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  // Initial load.
  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      const [{ data: r }, { data: s }] = await Promise.all([
        supabase
          .from('registrations')
          .select('*')
          .eq('state_code', code)
          .eq('voided', false)
          .maybeSingle(),
        supabase.from('session_settings').select('*').eq('id', 1).single()
      ])
      if (cancelled) return
      if (!r) {
        setNotFound(true)
      } else {
        setReg(r)
      }
      if (s) setSettings(s)
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [code])

  // Realtime: refetch this corps member's row whenever it changes,
  // and follow the current_batch from session_settings.
  useEffect(() => {
    if (!code) return
    const channel = supabase
      .channel(`status-${code}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'registrations', filter: `state_code=eq.${code}` },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            setReg(null)
            setNotFound(true)
          } else {
            setReg(payload.new)
            setNotFound(false)
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'session_settings', filter: 'id=eq.1' },
        (payload) => setSettings(payload.new)
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [code])

  if (loading) {
    return <CenteredCard><p className="text-slate-500">Loading…</p></CenteredCard>
  }

  if (notFound || !reg) {
    return (
      <CenteredCard>
        <div className="text-5xl mb-3">❓</div>
        <h1 className="text-2xl font-extrabold text-slate-900">No active registration</h1>
        <p className="text-slate-600 mt-2">
          We couldn’t find <span className="font-mono font-bold">{code}</span> in today’s queue.
          Please see an executive at the registration desk.
        </p>
      </CenteredCard>
    )
  }

  if (reg.voided) {
    return (
      <CenteredCard>
        <div className="text-5xl mb-3">⚠️</div>
        <h1 className="text-2xl font-extrabold text-slate-900">Entry voided</h1>
        <p className="text-slate-600 mt-2">Please return to the registration desk.</p>
      </CenteredCard>
    )
  }

  const currentBatch = settings?.current_batch ?? 0
  const isCleared = !!reg.served_at
  const isBeingServed = !isCleared && currentBatch > 0 && reg.batch_number === currentBatch
  const batchesAhead = currentBatch > 0 ? Math.max(0, reg.batch_number - currentBatch) : reg.batch_number

  let statusBlock
  if (isCleared) {
    statusBlock = (
      <div className="bg-emerald-100 border-2 border-emerald-600 text-emerald-900 rounded-2xl p-6 text-center">
        <div className="text-6xl">✅</div>
        <div className="text-2xl font-extrabold mt-2">Cleared</div>
        <div className="text-sm mt-1">You’re done. Have a great day.</div>
      </div>
    )
  } else if (isBeingServed) {
    statusBlock = (
      <div className="bg-amber-100 border-2 border-amber-500 text-amber-900 rounded-2xl p-6 text-center animate-pulse">
        <div className="text-6xl">🔔</div>
        <div className="text-2xl font-extrabold mt-2">Your batch is now being served</div>
        <div className="text-base mt-1">Head to clearance immediately.</div>
      </div>
    )
  } else {
    statusBlock = (
      <div className="bg-slate-100 border-2 border-slate-300 text-slate-800 rounded-2xl p-6 text-center">
        <div className="text-6xl">⏳</div>
        <div className="text-2xl font-extrabold mt-2">Waiting</div>
        <div className="text-base mt-1">
          {batchesAhead === 1
            ? '1 batch ahead of you'
            : `${batchesAhead} batches ahead of you`}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-md mx-auto p-4 sm:p-6">
      <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6 mt-4">
        <div className="text-center">
          <div className="text-xs uppercase tracking-wider text-emerald-700 font-bold">Eti-Osa 3 Special CDS · Clearance</div>
          <div className="mt-1 text-2xl font-extrabold text-slate-900 break-words">{reg.full_name}</div>
          <div className="text-slate-500 text-sm font-mono">{reg.state_code}</div>
        </div>

        <div className="grid grid-cols-2 gap-3 mt-5">
          <div className="bg-emerald-50 rounded-xl p-4 text-center">
            <div className="text-xs uppercase text-emerald-700 font-bold">Queue #</div>
            <div className="text-5xl font-extrabold text-emerald-900 leading-none mt-1">
              {reg.queue_number}
            </div>
          </div>
          <div className="bg-slate-100 rounded-xl p-4 text-center">
            <div className="text-xs uppercase text-slate-600 font-bold">Your batch</div>
            <div className="text-5xl font-extrabold text-slate-900 leading-none mt-1">
              {reg.batch_number}
            </div>
          </div>
        </div>

        <div className="mt-3 text-center text-sm text-slate-600">
          {currentBatch > 0
            ? <>Now serving batch <span className="font-extrabold text-slate-900">{currentBatch}</span></>
            : <span className="text-slate-500">Clearance has not started yet</span>}
        </div>

        <div className="mt-5">{statusBlock}</div>

        <p className="text-[11px] text-slate-400 text-center mt-4">
          This page updates automatically. Keep it open.
        </p>
      </div>
    </div>
  )
}

function CenteredCard({ children }) {
  return (
    <div className="max-w-md mx-auto p-6">
      <div className="bg-white rounded-2xl shadow border border-slate-200 p-8 mt-10 text-center">
        {children}
      </div>
    </div>
  )
}
