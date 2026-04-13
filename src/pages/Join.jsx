import { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase, STATE_CODE_REGEX, normalizeStateCode, getDeviceId, friendlyNetworkError } from '../lib/supabase.js'

// Jamatul Islamiyya Primary School, 52 Baale St, Lekki Peninsula II
const VENUE_LAT = 6.4360344
const VENUE_LNG = 3.523451
const RADIUS_METERS = 200

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// Compute next CDS day. Clearance = first Friday of each month, General CDS = last Friday.
function getNextCDSDay() {
  const today = new Date()
  const candidates = []

  // Check current month and next 2 months
  for (let offset = 0; offset < 3; offset++) {
    const year = today.getFullYear()
    const month = today.getMonth() + offset
    const d = new Date(year, month, 1)
    const m = d.getMonth()
    const y = d.getFullYear()

    // First Friday of the month (Clearance day)
    const firstDay = new Date(y, m, 1)
    const firstFriday = new Date(y, m, 1 + ((5 - firstDay.getDay() + 7) % 7))
    if (firstFriday > today) {
      candidates.push({ date: firstFriday, type: 'Clearance day' })
    }

    // Last Friday of the month (General CDS day)
    const lastDay = new Date(y, m + 1, 0) // last day of month
    const lastFriday = new Date(y, m + 1, 0 - ((lastDay.getDay() + 2) % 7))
    if (lastFriday > today) {
      candidates.push({ date: lastFriday, type: 'General CDS day' })
    }
  }

  candidates.sort((a, b) => a.date - b.date)
  return candidates[0] || null
}

export default function Join() {
  const navigate = useNavigate()

  const [geoState, setGeoState] = useState('checking') // checking | allowed | denied | too_far | error
  const [distance, setDistance] = useState(null)
  const [userCoords, setUserCoords] = useState(null)
  const [fullName, setFullName] = useState('')
  const [stateCode, setStateCode] = useState('')
  const [stateCodeError, setStateCodeError] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [registrationOpen, setRegistrationOpen] = useState(true)
  const [showConfirm, setShowConfirm] = useState(false)
  const [lookupCode, setLookupCode] = useState('')
  const [lookupBusy, setLookupBusy] = useState(false)
  const [lookupError, setLookupError] = useState('')
  const [recheckingGeo, setRecheckingGeo] = useState(false)
  const retryCount = useRef(0)

  // Poll registration status
  useEffect(() => {
    async function check() {
      try {
        const { data } = await supabase
          .from('session_settings')
          .select('registration_open')
          .eq('id', 1)
          .single()
        if (data) setRegistrationOpen(data.registration_open)
      } catch {}
    }
    check()
    const interval = setInterval(check, 30000)
    return () => clearInterval(interval)
  }, [])

  // Geolocation check function (reusable for recheck)
  const checkLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setGeoState('error')
      return
    }

    setGeoState('checking')
    setRecheckingGeo(true)

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude
        const lng = pos.coords.longitude
        setUserCoords({ lat, lng })
        const dist = haversineDistance(lat, lng, VENUE_LAT, VENUE_LNG)
        setDistance(Math.round(dist))
        setGeoState(dist <= RADIUS_METERS ? 'allowed' : 'too_far')
        setRecheckingGeo(false)
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setGeoState('denied')
        } else {
          setGeoState('error')
        }
        setRecheckingGeo(false)
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    )
  }, [])

  // Check geolocation on mount
  useEffect(() => { checkLocation() }, [checkLocation])

  // Lookup existing registration
  async function handleLookup() {
    const code = normalizeStateCode(lookupCode)
    if (!code) return
    setLookupBusy(true)
    setLookupError('')
    try {
      const { data } = await supabase
        .from('registrations')
        .select('state_code')
        .eq('state_code', code)
        .eq('voided', false)
        .maybeSingle()
      if (data) {
        navigate(`/status/${encodeURIComponent(data.state_code)}`)
      } else {
        setLookupError('No registration found for this state code today.')
      }
    } catch {
      setLookupError('Could not check. Try again.')
    }
    setLookupBusy(false)
  }

  function handleStateCodeBlur() {
    const code = normalizeStateCode(stateCode)
    if (code && !STATE_CODE_REGEX.test(code)) {
      setStateCodeError('State code format: XX/00X/0000 - e.g. LA/24A/1234 or LA/25B/11622.')
    } else {
      setStateCodeError('')
    }
  }

  async function handleFormSubmit(e) {
    e.preventDefault()
    setError('')
    setStateCodeError('')

    const code = normalizeStateCode(stateCode)
    const name = fullName.trim()

    if (!name) return setError('Enter your full name.')
    if (name.length < 2) return setError('Name must be at least 2 characters.')
    if (!STATE_CODE_REGEX.test(code)) {
      setStateCodeError('State code format: XX/00X/0000 - e.g. LA/24A/1234 or LA/25B/11622.')
      return
    }

    // Quick duplicate check before showing confirmation
    try {
      const { data } = await supabase
        .from('registrations')
        .select('state_code')
        .eq('state_code', code)
        .eq('voided', false)
        .maybeSingle()
      if (data) {
        setError(`duplicate:${code}`)
        return
      }
    } catch {
      // Network error — let them proceed, server will catch duplicates
    }

    // Show confirmation step
    setShowConfirm(true)
  }

  async function submitRegistration() {
    const code = normalizeStateCode(stateCode)
    const name = fullName.trim()

    setBusy(true)
    setError('')
    retryCount.current = 0

    async function attempt() {
      try {
        const params = {
          p_state_code: code,
          p_full_name: name,
          p_device_id: getDeviceId()
        }
        // Pass coordinates for server-side geofence validation
        if (userCoords) {
          params.p_lat = userCoords.lat
          params.p_lng = userCoords.lng
        }

        const { data, error: rpcError } = await supabase.rpc('register_corps_member', params)

        if (rpcError) {
          const msg = rpcError.message || ''
          if (msg.includes('duplicate_state_code')) {
            setError(`duplicate:${code}`)
          } else if (msg.includes('registration_closed')) {
            setError('Registration is closed for the day.')
          } else if (msg.includes('device_limit_reached')) {
            setError('You have already registered on this phone. If you need help, see an executive at the desk.')
          } else if (msg.includes('outside_geofence')) {
            setError('You must be at the venue to register. Move closer and try again.')
          } else if (friendlyNetworkError(msg)) {
            if (retryCount.current < 3) {
              retryCount.current += 1
              setError(`Network error. Retrying... (${retryCount.current}/3)`)
              setTimeout(attempt, 2000 * retryCount.current)
              return
            }
            setError(friendlyNetworkError(msg))
          } else {
            setError(msg || 'Could not register. Try again.')
          }
          setBusy(false)
          return
        }

        navigate(`/status/${encodeURIComponent(data.state_code)}`)
      } catch (err) {
        if (retryCount.current < 3) {
          retryCount.current += 1
          setError(`Connection lost. Retrying... (${retryCount.current}/3)`)
          setTimeout(attempt, 2000 * retryCount.current)
          return
        }
        setError('Network error. Please try again.')
        setBusy(false)
      }
    }

    await attempt()
  }

  // --- Render ---

  if (!registrationOpen) {
    const nextDay = getNextCDSDay()
    return (
      <CenteredCard>
        <div className="text-5xl mb-3">{'\uD83D\uDEAB'}</div>
        <h1 className="text-2xl font-extrabold text-amber-900">Registration closed</h1>
        <p className="text-amber-800 mt-2">Registration is closed for the day.</p>
        {nextDay && (
          <p className="text-amber-800 mt-2 text-sm">
            Next: <span className="font-bold">{nextDay.type}</span> {'\u2014'} {nextDay.date.toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        )}
        {/* Already registered? lookup */}
        <div className="mt-4 pt-4 border-t border-amber-300">
          <p className="text-amber-800 text-sm font-semibold">Already registered today?</p>
          <div className="mt-2 flex gap-2">
            <input
              type="text"
              value={lookupCode}
              onChange={(e) => { setLookupCode(e.target.value.toUpperCase()); setLookupError('') }}
              maxLength={20}
              autoComplete="off"
              autoCapitalize="characters"
              className="flex-1 rounded-lg border-2 border-amber-300 focus:border-amber-600 focus:outline-none px-3 py-2 text-sm font-mono tracking-wider"
              placeholder="State code"
            />
            <button
              onClick={handleLookup}
              disabled={lookupBusy || !lookupCode.trim()}
              className="bg-amber-700 hover:bg-amber-800 disabled:bg-slate-400 text-white font-bold px-3 py-2 rounded-lg text-sm"
            >
              {lookupBusy ? '...' : 'Check'}
            </button>
          </div>
          {lookupError && <p className="text-red-700 text-xs font-semibold mt-1">{lookupError}</p>}
        </div>
      </CenteredCard>
    )
  }

  if (geoState === 'checking') {
    return (
      <CenteredCard>
        <div className="text-5xl mb-3 animate-pulse">{'\uD83D\uDCCD'}</div>
        <h1 className="text-xl font-extrabold text-slate-900">Checking your location...</h1>
        <p className="text-slate-700 mt-2 text-sm">
          Please allow location access when prompted.
        </p>
      </CenteredCard>
    )
  }

  if (geoState === 'denied') {
    return (
      <CenteredCard>
        <div className="text-5xl mb-3">{'\uD83D\uDEAB'}</div>
        <h1 className="text-xl font-extrabold text-red-900">Location access denied</h1>
        <p className="text-slate-700 mt-2 text-sm">
          You need to allow location access to join the queue.
        </p>
        <ul className="text-slate-700 text-sm text-left mt-2 space-y-1 list-disc pl-5">
          <li><strong>iPhone:</strong> Settings {'\u2192'} Safari {'\u2192'} Location {'\u2192'} Allow</li>
          <li><strong>Android:</strong> Tap the lock icon in the address bar {'\u2192'} Permissions {'\u2192'} Location {'\u2192'} Allow</li>
        </ul>
        <button
          onClick={checkLocation}
          disabled={recheckingGeo}
          className="mt-4 bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-400 text-white font-bold py-3 px-6 rounded-xl"
        >
          {recheckingGeo ? 'Checking...' : 'Retry'}
        </button>
      </CenteredCard>
    )
  }

  if (geoState === 'too_far') {
    return (
      <CenteredCard>
        <div className="text-5xl mb-3">{'\uD83D\uDCCD'}</div>
        <h1 className="text-xl font-extrabold text-red-900">You are not at the venue</h1>
        <p className="text-slate-700 mt-2 text-sm">
          You must be at <span className="font-semibold">Jamatul Islamiyya Primary School, Baale St, Lekki</span> to join the queue.
        </p>
        {distance != null && (
          <p className="text-slate-600 text-xs mt-2">
            You are approximately {distance >= 1000 ? `${(distance / 1000).toFixed(1)} km` : `${distance} m`} away.
          </p>
        )}
        <button
          onClick={checkLocation}
          disabled={recheckingGeo}
          className="mt-4 bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-400 text-white font-bold py-3 px-6 rounded-xl"
        >
          {recheckingGeo ? 'Checking...' : 'Check again'}
        </button>
      </CenteredCard>
    )
  }

  if (geoState === 'error') {
    return (
      <CenteredCard>
        <div className="text-5xl mb-3">{'\u26A0\uFE0F'}</div>
        <h1 className="text-xl font-extrabold text-slate-900">Location unavailable</h1>
        <p className="text-slate-700 mt-2 text-sm">
          We could not determine your location. Try these steps:
        </p>
        <ul className="text-slate-700 text-sm text-left mt-2 space-y-1 list-disc pl-5">
          <li>Make sure <strong>Location Services</strong> are turned on in your phone settings</li>
          <li>Move to an open area (away from buildings)</li>
          <li>Turn off battery saver mode</li>
          <li>Close and reopen your browser</li>
        </ul>
        <button
          onClick={checkLocation}
          disabled={recheckingGeo}
          className="mt-4 bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-400 text-white font-bold py-3 px-6 rounded-xl"
        >
          {recheckingGeo ? 'Checking...' : 'Retry'}
        </button>
      </CenteredCard>
    )
  }

  // Confirmation step
  if (showConfirm) {
    return (
      <div className="max-w-md mx-auto p-4 sm:p-6">
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6 mt-6">
          <h2 className="text-xl font-extrabold text-slate-900 text-center">Confirm your details</h2>
          <p className="text-slate-700 text-sm text-center mt-1">After confirming, you will get a queue number and can track your status live on your phone.</p>

          <div className="mt-5 space-y-3">
            <div className="bg-slate-50 rounded-xl p-4">
              <div className="text-xs uppercase text-slate-600 font-bold">Full name</div>
              <div className="text-lg font-semibold text-slate-900 mt-0.5">{fullName.trim()}</div>
            </div>
            <div className="bg-slate-50 rounded-xl p-4">
              <div className="text-xs uppercase text-slate-600 font-bold">State code</div>
              <div className="text-lg font-semibold text-slate-900 font-mono mt-0.5">{normalizeStateCode(stateCode)}</div>
            </div>
          </div>

          {error && (
            <div className="mt-4 bg-red-50 border-2 border-red-300 text-red-800 rounded-lg px-3 py-2 text-sm font-semibold">
              {error.startsWith('duplicate:') ? (
                <>
                  You have already registered today.
                  <Link to={`/status/${encodeURIComponent(error.replace('duplicate:', ''))}`} className="block mt-1.5 text-emerald-700 underline font-bold">
                    View your status page {'\u2192'}
                  </Link>
                </>
              ) : error}
            </div>
          )}

          <div className="mt-5 flex gap-3">
            <button
              onClick={() => { setShowConfirm(false); setError('') }}
              disabled={busy}
              className="flex-1 bg-slate-200 hover:bg-slate-300 active:bg-slate-400 disabled:bg-slate-100 text-slate-900 font-bold py-3 rounded-xl text-base"
            >
              Go back
            </button>
            <button
              onClick={submitRegistration}
              disabled={busy}
              className="flex-1 bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 disabled:bg-slate-400 text-white font-bold py-3 rounded-xl text-base"
            >
              {busy ? 'Joining...' : 'Confirm & Join'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // geoState === 'allowed' — show registration form
  return (
    <div className="max-w-md mx-auto p-4 sm:p-6">
      <div className="text-center mt-4">
        <div className="inline-flex items-center gap-1.5 bg-emerald-100 text-emerald-800 text-xs font-bold px-3 py-1 rounded-full">
          <span>{'\u2705'}</span> You are at the venue
        </div>
      </div>

      <h1 className="text-2xl font-extrabold text-slate-900 mt-4 text-center">Join the Queue</h1>
      <p className="text-slate-700 text-sm text-center">Eti-Osa 3 Special CDS Clearance</p>

      <form onSubmit={handleFormSubmit} className="mt-5 bg-white rounded-2xl shadow border border-slate-200 p-5 space-y-4">
        <label className="block">
          <span className="text-sm font-semibold text-slate-700">Full name</span>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            maxLength={200}
            autoComplete="name"
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
            maxLength={20}
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
          Join Queue
        </button>
      </form>

      {/* Already registered lookup */}
      <div className="mt-4 bg-white rounded-2xl shadow border border-slate-200 p-4">
        <p className="text-sm font-semibold text-slate-700 text-center">Already registered?</p>
        <div className="mt-2 flex gap-2">
          <input
            type="text"
            value={lookupCode}
            onChange={(e) => { setLookupCode(e.target.value.toUpperCase()); setLookupError('') }}
            maxLength={20}
            autoComplete="off"
            autoCapitalize="characters"
            className="flex-1 rounded-lg border-2 border-slate-300 focus:border-emerald-700 focus:outline-none px-3 py-2.5 text-sm font-mono tracking-wider"
            placeholder="Enter state code"
          />
          <button
            onClick={handleLookup}
            disabled={lookupBusy || !lookupCode.trim()}
            className="bg-slate-700 hover:bg-slate-800 disabled:bg-slate-400 text-white font-bold px-4 py-2.5 rounded-lg text-sm whitespace-nowrap"
          >
            {lookupBusy ? 'Checking...' : 'Check status'}
          </button>
        </div>
        {lookupError && (
          <p className="text-red-700 text-xs font-semibold mt-1.5">{lookupError}</p>
        )}
      </div>

      <p className="text-[11px] text-slate-500 text-center mt-4">
        After joining, you will see your queue number and can track your status live.
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
