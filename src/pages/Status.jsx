import { useEffect, useState, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'

export default function Status() {
  const { stateCode } = useParams()
  const code = (stateCode || '').toUpperCase()

  const [reg, setReg] = useState(null)
  const [settings, setSettings] = useState(null)
  const [batchMembers, setBatchMembers] = useState([])
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
        // Load batch members for this person's batch
        const { data: members } = await supabase
          .from('registrations')
          .select('id, full_name, state_code, queue_number, batch_number, served_at, voided')
          .eq('batch_number', r.batch_number)
          .eq('voided', false)
          .order('queue_number', { ascending: true })
        if (!cancelled && members) setBatchMembers(members)
      }
      if (s) setSettings(s)
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [code])

  // Realtime subscriptions.
  useEffect(() => {
    if (!code) return
    const channel = supabase
      .channel(`status-${code}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'registrations' },
        (payload) => {
          // Update this corps member's own row
          if (payload.eventType === 'DELETE' && payload.old?.state_code === code) {
            setReg(null)
            setNotFound(true)
          } else if (payload.new?.state_code === code) {
            setReg(payload.new)
            setNotFound(false)
          }

          // Update batch members list in real time
          setBatchMembers((prev) => {
            if (payload.eventType === 'INSERT' && payload.new && !payload.new.voided) {
              // Check if this new member is in our batch
              if (prev.length > 0 && payload.new.batch_number === prev[0].batch_number) {
                if (prev.some((m) => m.id === payload.new.id)) return prev
                return [...prev, payload.new].sort((a, b) => a.queue_number - b.queue_number)
              }
              return prev
            }
            if (payload.eventType === 'UPDATE' && payload.new) {
              return prev
                .map((m) => (m.id === payload.new.id ? payload.new : m))
                .filter((m) => !m.voided)
            }
            if (payload.eventType === 'DELETE') {
              return prev.filter((m) => m.id !== payload.old.id)
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

    return () => { supabase.removeChannel(channel) }
  }, [code])

  if (loading) {
    return <CenteredCard><p className="text-slate-500">Loading...</p></CenteredCard>
  }

  if (notFound || !reg) {
    return (
      <CenteredCard>
        <div className="text-5xl mb-3">&#x2753;</div>
        <h1 className="text-2xl font-extrabold text-slate-900">No active registration</h1>
        <p className="text-slate-600 mt-2">
          We could not find <span className="font-mono font-bold">{code}</span> in today's queue.
          Please see an executive at the registration desk.
        </p>
      </CenteredCard>
    )
  }

  if (reg.voided) {
    return (
      <CenteredCard>
        <div className="text-5xl mb-3">&#x26A0;&#xFE0F;</div>
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
        <div className="text-6xl">&#x2705;</div>
        <div className="text-2xl font-extrabold mt-2">Cleared</div>
        <div className="text-sm mt-1">You are done. Have a great day.</div>
      </div>
    )
  } else if (isBeingServed) {
    statusBlock = (
      <div className="bg-amber-100 border-2 border-amber-500 text-amber-900 rounded-2xl p-6 text-center animate-pulse">
        <div className="text-6xl">&#x1F514;</div>
        <div className="text-2xl font-extrabold mt-2">Your batch is now being served</div>
        <div className="text-base mt-1">Head to clearance immediately.</div>
      </div>
    )
  } else {
    statusBlock = (
      <div className="bg-slate-100 border-2 border-slate-300 text-slate-800 rounded-2xl p-6 text-center">
        <div className="text-6xl">&#x23F3;</div>
        <div className="text-2xl font-extrabold mt-2">Waiting</div>
        <div className="text-base mt-1">
          {batchesAhead === 1
            ? '1 batch ahead of you'
            : `${batchesAhead} batches ahead of you`}
        </div>
      </div>
    )
  }

  // Batch queue stats
  const batchServed = batchMembers.filter((m) => !!m.served_at).length
  const batchTotal = batchMembers.length

  return (
    <div className="max-w-md mx-auto p-4 sm:p-6">
      {/* Personal status card */}
      <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6 mt-4">
        <div className="text-center">
          <div className="text-xs uppercase tracking-wider text-emerald-700 font-bold">Eti-Osa 3 Special CDS &middot; Clearance</div>
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
      </div>

      {/* Batch queue list */}
      {batchMembers.length > 0 && (
        <div className="bg-white rounded-2xl shadow border border-slate-200 mt-4 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
            <div>
              <div className="font-extrabold text-slate-900 text-sm">Batch {reg.batch_number} Queue</div>
              <div className="text-xs text-slate-500">{batchServed} of {batchTotal} served</div>
            </div>
            <div className="bg-slate-100 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-700">
              {batchTotal} members
            </div>
          </div>
          <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
            {batchMembers.map((m) => {
              const isYou = m.state_code === code
              const served = !!m.served_at
              return (
                <div
                  key={m.id}
                  className={`px-4 py-2.5 flex items-center gap-3 ${
                    isYou ? 'bg-emerald-50' : ''
                  }`}
                >
                  <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-xs font-extrabold text-slate-700 flex-shrink-0">
                    {m.queue_number}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-semibold truncate ${isYou ? 'text-emerald-900' : 'text-slate-900'}`}>
                      {m.full_name}
                      {isYou && <span className="ml-1.5 text-[10px] bg-emerald-200 text-emerald-800 font-bold px-1.5 py-0.5 rounded-full uppercase">You</span>}
                    </div>
                    <div className="text-xs text-slate-500 font-mono">{m.state_code}</div>
                  </div>
                  <div className={`text-xs font-bold flex-shrink-0 ${
                    served ? 'text-emerald-700' : 'text-slate-500'
                  }`}>
                    {served ? '&#x2713; Served' : 'Waiting'}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <p className="text-[11px] text-slate-400 text-center mt-4 mb-6">
        This page updates automatically. Keep it open.
      </p>
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
