import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, STATE_CODE_REGEX, normalizeStateCode, getDeviceId } from '../lib/supabase.js'

// Jamatul Islamiyya Primary School, 52 Baale St, Lekki Peninsula II
const VENUE_LAT = 6.4360344
const VENUE_LNG = 3.523451
const RADIUS_METERS = 200

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000 // Earth radius in meters
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export default function Join() {
  const navigate = useNavigate()

  const [geoState, setGeoState] = useState('checking') // checking | allowed | denied | too_far | error
  const [distance, setDistance] = useState(null)
  const [fullName, setFullName] = useState('')
  const [stateCode, setStateCode] = useState('')
  const [stateCodeError, setStateCodeError] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [registrationOpen, setRegistrationOpen] = useState(true)

  // Check registration status
  useEffect(() => {
    async function check() {
      const { data } = await supabase
        .from('session_settings')
        .select('registration_open')
        .eq('id', 1)
        .single()
      if (data) setRegistrationOpen(data.registration_open)
    }
    check()
    const interval = setInterval(check, 30000)
    return () => clearInterval(interval)
  }, [])

  // Check geolocation
  useEffect(() => {
    if (!navigator.geolocation) {
      setGeoState('error')
      return
    }

    setGeoState('checking')

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const dist = haversineDistance(
          pos.coords.latitude,
          pos.coords.longitude,
          VENUE_LAT,
          VENUE_LNG
        )
        setDistance(Math.round(dist))
        if (dist <= RADIUS_METERS) {
          setGeoState('allowed')
        } else {
          setGeoState('too_far')
        }
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setGeoState('denied')
        } else {
          setGeoState('error')
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    )
  }, [])

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

    if (!name) return setError('Enter your full name.')
    if (!STATE_CODE_REGEX.test(code)) {
      setStateCodeError('State code format: XX/00X/0000 - e.g. LA/24A/1234 or LA/25B/11622.')
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
          setError('You have already registered today.')
        } else if (msg.includes('registration_closed')) {
          setError('Registration is closed for the day.')
        } else if (msg.toLowerCase().includes('failed to fetch')) {
          setError('No internet connection. Check your data or Wi-Fi and try again.')
        } else {
          setError(msg || 'Could not register. Try again.')
        }
        return
      }

      // Redirect to status page
      navigate(`/status/${encodeURIComponent(data.state_code)}`)
    } catch (err) {
      setError(err.message || 'Network error. Try again.')
    } finally {
      setBusy(false)
    }
  }

  // --- Render ---

  if (!registrationOpen) {
    return (
      <CenteredCard>
        <div className="text-5xl mb-3">&#x1F6AB;</div>
        <h1 className="text-2xl font-extrabold text-amber-900">Registration closed</h1>
        <p className="text-amber-800 mt-2">Registration is closed for the day. Please check back tomorrow.</p>
      </CenteredCard>
    )
  }

  if (geoState === 'checking') {
    return (
      <CenteredCard>
        <div className="text-5xl mb-3 animate-pulse">&#x1F4CD;</div>
        <h1 className="text-xl font-extrabold text-slate-900">Checking your location...</h1>
        <p className="text-slate-600 mt-2 text-sm">
          Please allow location access when prompted.
        </p>
      </CenteredCard>
    )
  }

  if (geoState === 'denied') {
    return (
      <CenteredCard>
        <div className="text-5xl mb-3">&#x1F6AB;</div>
        <h1 className="text-xl font-extrabold text-red-900">Location access denied</h1>
        <p className="text-slate-600 mt-2 text-sm">
          You need to allow location access to join the queue. Open your browser settings, enable location for this site, then refresh the page.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 bg-emerald-700 hover:bg-emerald-800 text-white font-bold py-3 px-6 rounded-xl"
        >
          Retry
        </button>
      </CenteredCard>
    )
  }

  if (geoState === 'too_far') {
    return (
      <CenteredCard>
        <div className="text-5xl mb-3">&#x1F4CD;</div>
        <h1 className="text-xl font-extrabold text-red-900">You are not at the venue</h1>
        <p className="text-slate-600 mt-2 text-sm">
          You must be at <span className="font-semibold">Jamatul Islamiyya Primary School, Baale St, Lekki</span> to join the queue.
        </p>
        {distance && (
          <p className="text-slate-500 text-xs mt-2">
            You are approximately {distance >= 1000 ? `${(distance / 1000).toFixed(1)} km` : `${distance} m`} away.
          </p>
        )}
        <button
          onClick={() => window.location.reload()}
          className="mt-4 bg-emerald-700 hover:bg-emerald-800 text-white font-bold py-3 px-6 rounded-xl"
        >
          Check again
        </button>
      </CenteredCard>
    )
  }

  if (geoState === 'error') {
    return (
      <CenteredCard>
        <div className="text-5xl mb-3">&#x26A0;&#xFE0F;</div>
        <h1 className="text-xl font-extrabold text-slate-900">Location unavailable</h1>
        <p className="text-slate-600 mt-2 text-sm">
          We could not determine your location. Make sure location services are enabled on your phone and try again.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 bg-emerald-700 hover:bg-emerald-800 text-white font-bold py-3 px-6 rounded-xl"
        >
          Retry
        </button>
      </CenteredCard>
    )
  }

  // geoState === 'allowed' — show registration form
  return (
    <div className="max-w-md mx-auto p-4 sm:p-6">
      <div className="text-center mt-4">
        <div className="inline-flex items-center gap-1.5 bg-emerald-100 text-emerald-800 text-xs font-bold px-3 py-1 rounded-full">
          <span>&#x2705;</span> You are at the venue
        </div>
      </div>

      <h1 className="text-2xl font-extrabold text-slate-900 mt-4 text-center">Join the Queue</h1>
      <p className="text-slate-600 text-sm text-center">Eti-Osa 3 Special CDS Clearance</p>

      <form onSubmit={handleSubmit} className="mt-5 bg-white rounded-2xl shadow border border-slate-200 p-5 space-y-4">
        <label className="block">
          <span className="text-sm font-semibold text-slate-700">Full name</span>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
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
          {busy ? 'Joining queue...' : 'Join Queue'}
        </button>
      </form>

      <p className="text-[11px] text-slate-400 text-center mt-4">
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
