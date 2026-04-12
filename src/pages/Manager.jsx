import { useEffect, useState } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import { supabase, STATE_CODE_REGEX, normalizeStateCode, getDeviceId } from '../lib/supabase.js'

export default function Manager() {
  const [fullName, setFullName] = useState('')
  const [stateCode, setStateCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [stateCodeError, setStateCodeError] = useState('')
  const [result, setResult] = useState(null) // {state_code, queue_number, batch_number, full_name}
  const [registrationOpen, setRegistrationOpen] = useState(true)

  // Poll registration_open flag every 10 seconds (saves realtime connections).
  useEffect(() => {
    let cancelled = false

    async function check() {
      const { data } = await supabase
        .from('session_settings')
        .select('registration_open')
        .eq('id', 1)
        .single()
      if (!cancelled && data) setRegistrationOpen(data.registration_open)
    }
    check()
    const interval = setInterval(check, 10000)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  function reset() {
    setFullName('')
    setStateCode('')
    setError('')
    setStateCodeError('')
    setResult(null)
  }

  function handleStateCodeBlur() {
    const code = normalizeStateCode(stateCode)
    if (code && !STATE_CODE_REGEX.test(code)) {
      setStateCodeError('State code format: XX/00X/0000 - e.g. LA/24A/1234 or LA/25B/11622.')
    } else {
      setStateCodeError('')
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setStateCodeError('')

    const code = normalizeStateCode(stateCode)
    const name = fullName.trim()

    if (!name) return setError('Enter the corps member\u2019s full name.')
    if (!STATE_CODE_REGEX.test(code)) {
      setStateCodeError('State code format: XX/00X/0000 \u2014 e.g. LA/24A/1234 or LA/25B/11622.')
      return
    }

    setBusy(true)
    try {
      const { data, error: rpcError } = await supabase.rpc('register_corps_member', {
        p_state_code: code,
        p_full_name: name,
        p_device_id: getDeviceId()
      })

      if (rpcError) {
        const msg = rpcError.message || ''
        if (msg.includes('duplicate_state_code')) {
          setError('This state code has already registered today.')
        } else if (msg.includes('registration_closed')) {
          setError('Registration is closed for the day.')
        } else if (msg.includes('device_limit_reached')) {
          setError('Too many registrations from this device. Limit is 5 per session.')
        } else if (msg.includes('register_corps_member') || (msg.includes('function') && msg.includes('does not exist'))) {
          setError('Database not set up yet. An executive must run the SQL setup file in Supabase before registrations can be saved.')
        } else if (msg.toLowerCase().includes('failed to fetch')) {
          setError('No internet connection to the server. Check Wi-Fi and try again.')
        } else if (msg.includes('JWT') || msg.includes('Invalid API key')) {
          setError("Server rejected this device's API key. Tell the executive to check the deployment settings.")
        } else {
          setError(msg || 'Could not register. Try again.')
        }
        // eslint-disable-next-line no-console
        console.error('[manager] register error', rpcError)
        return
      }
      setResult(data)
    } catch (err) {
      setError(err.message || 'Network error. Try again.')
    } finally {
      setBusy(false)
    }
  }

  if (!registrationOpen && !result) {
    return (
      <div className="max-w-md mx-auto p-6 mt-10">
        <div className="bg-amber-100 border-2 border-amber-500 rounded-xl p-6 text-center">
          <div className="text-5xl mb-3">🚫</div>
          <h1 className="text-2xl font-extrabold text-amber-900">Registration closed for the day</h1>
          <p className="text-amber-900 mt-2">Please direct corps members to come back tomorrow.</p>
        </div>
      </div>
    )
  }

  if (result) {
    const statusUrl = `${window.location.origin}/status/${encodeURIComponent(result.state_code)}`
    return (
      <div className="max-w-md mx-auto p-4 sm:p-6">
        <div className="bg-white rounded-2xl shadow-lg border border-emerald-200 p-6 mt-4">
          <div className="text-center">
            <div className="text-sm uppercase tracking-wider text-emerald-700 font-bold">Registered · Eti-Osa 3 Special CDS</div>
            <div className="mt-1 text-xl font-semibold text-slate-900 break-words">{result.full_name}</div>
            <div className="text-slate-500 text-sm">{result.state_code}</div>
          </div>

          <div className="grid grid-cols-2 gap-3 mt-5">
            <div className="bg-emerald-50 rounded-xl p-4 text-center">
              <div className="text-xs uppercase text-emerald-700 font-bold">Queue #</div>
              <div className="text-4xl font-extrabold text-emerald-900 leading-none mt-1">
                {result.queue_number}
              </div>
            </div>
            <div className="bg-slate-100 rounded-xl p-4 text-center">
              <div className="text-xs uppercase text-slate-600 font-bold">Wave</div>
              <div className="text-4xl font-extrabold text-slate-900 leading-none mt-1">
                {result.batch_number}
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-col items-center">
            <div className="bg-white p-3 rounded-lg border border-slate-200">
              <QRCodeCanvas value={statusUrl} size={196} includeMargin={false} />
            </div>
            <p className="text-xs text-slate-500 mt-2 text-center">
              Corps member scans this with their phone to track status.
            </p>
            <p className="text-[11px] text-slate-400 mt-1 break-all text-center">{statusUrl}</p>
          </div>

          <button
            onClick={reset}
            className="w-full mt-6 bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 text-white font-bold py-4 rounded-xl text-lg"
          >
            Next corps member →
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-md mx-auto p-4 sm:p-6">
      <h1 className="text-2xl font-extrabold text-slate-900 mt-2">Register corps member</h1>
      <p className="text-slate-600 text-sm">Eti-Osa 3 Special CDS · Entrance check-in</p>

      <form onSubmit={handleSubmit} className="mt-5 bg-white rounded-2xl shadow border border-slate-200 p-5 space-y-4">
        <label className="block">
          <span className="text-sm font-semibold text-slate-700">Full name</span>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            autoComplete="off"
            autoCapitalize="words"
            className="mt-1 w-full rounded-lg border-2 border-slate-300 focus:border-emerald-700 focus:outline-none px-3 py-3 text-lg"
            placeholder="e.g. Adaeze Okonkwo"
            disabled={busy}
          />
        </label>

        <label className="block">
          <span className="text-sm font-semibold text-slate-700">State code</span>
          <input
            type="text"
            value={stateCode}
            onChange={(e) => { setStateCode(e.target.value.toUpperCase()); setStateCodeError('') }}
            onBlur={handleStateCodeBlur}
            onFocus={() => setStateCodeError('')}
            autoComplete="off"
            autoCapitalize="characters"
            className={`mt-1 w-full rounded-lg border-2 focus:outline-none px-3 py-3 text-lg font-mono tracking-wider ${stateCodeError ? 'border-red-400 focus:border-red-500' : 'border-slate-300 focus:border-emerald-700'}`}
            placeholder="LA/24A/1234"
            disabled={busy}
          />
          {stateCodeError && (
            <div className="text-red-700 text-sm font-semibold mt-1">{stateCodeError}</div>
          )}
        </label>

        {error && (
          <div className="bg-red-50 border-2 border-red-300 text-red-800 rounded-lg px-3 py-2 text-sm font-semibold">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 disabled:bg-slate-400 text-white font-bold py-4 rounded-xl text-lg"
        >
          {busy ? 'Registering…' : 'Register & generate QR'}
        </button>
      </form>
    </div>
  )
}
