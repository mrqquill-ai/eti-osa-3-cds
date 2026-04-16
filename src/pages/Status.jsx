import { useEffect, useState, useMemo, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'

export default function Status() {
  const { stateCode } = useParams()
  const code = (stateCode || '').toUpperCase()

  const [reg, setReg] = useState(null)
  const [settings, setSettings] = useState(null)
  const [batchMembers, setBatchMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const prevWaveServing = useRef(null)

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
        const { data: members } = await supabase
          .from('registrations')
          .select('id, full_name, state_code, queue_number, batch_number, served_at, voided')
          .eq('batch_number', r.batch_number)
          .eq('voided', false)
          .order('queue_number', { ascending: true })
        if (!cancelled && members) setBatchMembers(members)
      }
      if (s) {
        setSettings(s)
        prevWaveServing.current = s.current_batch
      }
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [code])

  // Poll every 30 seconds instead of realtime (saves connection limits).
  useEffect(() => {
    if (!code || notFound) return

    const poll = async () => {
      const [{ data: r }, { data: s }] = await Promise.all([
        supabase
          .from('registrations')
          .select('*')
          .eq('state_code', code)
          .eq('voided', false)
          .maybeSingle(),
        supabase.from('session_settings').select('*').eq('id', 1).single()
      ])

      if (!r) {
        setReg(null)
        setNotFound(true)
        return
      }

      setReg(r)
      if (s) {
        // Vibrate when this person's wave starts being served
        if (
          prevWaveServing.current !== s.current_batch &&
          s.current_batch === r.batch_number &&
          !r.served_at
        ) {
          try {
            if (navigator.vibrate) navigator.vibrate([300, 100, 300, 100, 300])
          } catch {}
        }
        prevWaveServing.current = s.current_batch
        setSettings(s)
      }

      const { data: members } = await supabase
        .from('registrations')
        .select('id, full_name, state_code, queue_number, batch_number, served_at, voided')
        .eq('batch_number', r.batch_number)
        .eq('voided', false)
        .order('queue_number', { ascending: true })
      if (members) setBatchMembers(members)
    }

    const interval = setInterval(poll, 30000)
    return () => clearInterval(interval)
  }, [code, notFound])

  // Separate effect: poll faster (every 10s) when this person's wave is being served
  useEffect(() => {
    if (!reg || !settings || reg.served_at) return
    if (settings.current_batch !== reg.batch_number) return
    // Wave is active — add a faster poll on top of the 30s one
    const fastPoll = setInterval(async () => {
      const [{ data: r }, { data: s }] = await Promise.all([
        supabase.from('registrations').select('*').eq('state_code', code).eq('voided', false).maybeSingle(),
        supabase.from('session_settings').select('*').eq('id', 1).single()
      ])
      if (r) setReg(r)
      if (s) setSettings(s)
      if (r) {
        const { data: members } = await supabase
          .from('registrations')
          .select('id, full_name, state_code, queue_number, batch_number, served_at, voided')
          .eq('batch_number', r.batch_number)
          .eq('voided', false)
          .order('queue_number', { ascending: true })
        if (members) setBatchMembers(members)
      }
    }, 10000)
    return () => clearInterval(fastPoll)
  }, [reg?.batch_number, reg?.served_at, settings?.current_batch, code])

  if (loading) {
    return <CenteredCard><p className="text-slate-700">Loading...</p></CenteredCard>
  }

  if (notFound || !reg) {
    return (
      <CenteredCard>
        <div className="text-5xl mb-3">{'\u2753'}</div>
        <h1 className="text-2xl font-extrabold text-slate-900">No active registration</h1>
        <p className="text-slate-700 mt-2">
          We could not find <span className="font-mono font-bold">{code}</span> in today's queue.
        </p>
        <Link
          to="/join"
          className="inline-block mt-4 bg-emerald-700 hover:bg-emerald-800 text-white font-bold py-3 px-6 rounded-xl"
        >
          Join the queue
        </Link>
        <p className="text-slate-500 text-xs mt-2">Or see an executive at the registration desk.</p>
      </CenteredCard>
    )
  }

  if (reg.voided) {
    return (
      <CenteredCard>
        <div className="text-5xl mb-3">{'\u26A0\uFE0F'}</div>
        <h1 className="text-2xl font-extrabold text-slate-900">Entry voided</h1>
        <p className="text-slate-700 mt-2">Please return to the registration desk.</p>
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
        <div className="text-6xl">{'\u2705'}</div>
        <div className="text-2xl font-extrabold mt-2">Cleared</div>
        <div className="text-sm mt-1">You are done. Have a great day.</div>
      </div>
    )
  } else if (isBeingServed) {
    statusBlock = (
      <div className="bg-amber-100 border-2 border-amber-500 text-amber-900 rounded-2xl p-6 text-center animate-pulse">
        <div className="text-6xl">{'\uD83D\uDD14'}</div>
        <div className="text-2xl font-extrabold mt-2">Your wave is now being served</div>
        <div className="text-base mt-1">Head to clearance immediately.</div>
      </div>
    )
  } else if (currentBatch > 0 && batchesAhead > 0) {
    statusBlock = (
      <div className="bg-slate-100 border-2 border-slate-300 text-slate-900 rounded-2xl p-6 text-center">
        <div className="text-6xl">{'\u23F3'}</div>
        <div className="text-2xl font-extrabold mt-2">Waiting</div>
        <div className="text-base mt-1">
          You are in <span className="font-extrabold">Wave {reg.batch_number}</span>
        </div>
        <div className="text-sm mt-1 text-slate-700">
          Wave {currentBatch} is being served now {'\u2014'} {batchesAhead === 1 ? 'you are next!' : `${batchesAhead} waves before yours`}
        </div>
        {batchesAhead > 0 && (
          <div className="text-xs mt-1 text-slate-600">Estimated wait: ~{batchesAhead * 10}-{batchesAhead * 15} minutes</div>
        )}
      </div>
    )
  } else {
    statusBlock = (
      <div className="bg-slate-100 border-2 border-slate-300 text-slate-900 rounded-2xl p-6 text-center">
        <div className="text-6xl">{'\u23F3'}</div>
        <div className="text-2xl font-extrabold mt-2">Waiting</div>
        <div className="text-base mt-1">
          You are in <span className="font-extrabold">Wave {reg.batch_number}</span>
        </div>
        <div className="text-sm mt-1 text-slate-700">
          Clearance has not started yet
        </div>
      </div>
    )
  }

  const batchServed = batchMembers.filter((m) => !!m.served_at).length
  const batchTotal = batchMembers.length

  return (
    <div className="max-w-md mx-auto p-4 sm:p-6">
      {/* Announcement banner */}
      {settings?.announcement && (
        <div className="bg-amber-100 border-2 border-amber-400 text-amber-900 rounded-xl p-3 mt-4 text-sm font-semibold text-center">
          {'\uD83D\uDCE2'} {settings.announcement}
        </div>
      )}

      {/* Personal status card */}
      <div className={`bg-white rounded-2xl shadow-lg border border-slate-200 p-6 ${settings?.announcement ? 'mt-3' : 'mt-4'}`}>
        <div className="text-center">
          <div className="text-xs uppercase tracking-wider text-emerald-700 font-bold">Eti-Osa 3 Special CDS {'\u00B7'} Clearance</div>
          <div className="mt-1 text-2xl font-extrabold text-slate-900 break-words">{reg.full_name}</div>
          <div className="text-slate-700 text-sm font-mono">{reg.state_code}</div>
        </div>

        <div className="grid grid-cols-2 gap-3 mt-5">
          <div className="bg-emerald-50 rounded-xl p-4 text-center">
            <div className="text-xs uppercase text-emerald-700 font-bold">Queue #</div>
            <div className="text-5xl font-extrabold text-emerald-900 leading-none mt-1">
              {reg.queue_number}
            </div>
          </div>
          <div className="bg-slate-100 rounded-xl p-4 text-center">
            <div className="text-xs uppercase text-slate-700 font-bold">Your wave</div>
            <div className="text-5xl font-extrabold text-slate-900 leading-none mt-1">
              {reg.batch_number}
            </div>
          </div>
        </div>

        <div className="mt-3 text-center text-sm text-slate-700">
          {currentBatch > 0
            ? <>Now serving wave <span className="font-extrabold text-slate-900">{currentBatch}</span></>
            : <span className="text-slate-600">Clearance has not started yet</span>}
        </div>

        <div className="mt-5">{statusBlock}</div>
      </div>

      {/* Batch queue list */}
      {batchMembers.length > 0 && (
        <div className="bg-white rounded-2xl shadow border border-slate-200 mt-4 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
            <div>
              <div className="font-extrabold text-slate-900 text-sm">Wave {reg.batch_number} Queue</div>
              <div className="text-xs text-slate-600">{batchServed} of {batchTotal} served</div>
            </div>
            <div className="bg-slate-100 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-800">
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
                  <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-xs font-extrabold text-slate-800 flex-shrink-0">
                    {m.queue_number}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-semibold truncate ${isYou ? 'text-emerald-900' : 'text-slate-900'}`}>
                      {isYou ? m.full_name : m.full_name.split(' ')[0]}
                      {isYou && <span className="ml-1.5 text-[10px] bg-emerald-200 text-emerald-800 font-bold px-1.5 py-0.5 rounded-full uppercase">You</span>}
                    </div>
                    <div className="text-xs text-slate-600 font-mono">
                      {isYou ? m.state_code : m.state_code.replace(/(\w{2}\/\w+\/)(\d+)/, (_, prefix, digits) => prefix + digits.slice(0, 2) + '***')}
                    </div>
                  </div>
                  <div className={`text-xs font-bold flex-shrink-0 ${
                    served ? 'text-emerald-700' : 'text-slate-600'
                  }`}>
                    {served ? '\u2713 Served' : 'Waiting'}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <p className="text-[11px] text-slate-500 text-center mt-4 mb-6">
        This page refreshes automatically. Keep it open.
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
