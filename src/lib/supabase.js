import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anon) {
  // eslint-disable-next-line no-console
  console.warn(
    '[supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env.local and fill in your project credentials.'
  )
}

export const supabase = createClient(url ?? 'http://localhost', anon ?? 'public-anon')

// Generate a stable browser fingerprint based on hardware/software traits.
function getBrowserFingerprint() {
  try {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    ctx.textBaseline = 'top'
    ctx.font = '14px Arial'
    ctx.fillText('fp', 2, 2)
    const canvasHash = canvas.toDataURL().slice(-50)

    const traits = [
      navigator.userAgent,
      navigator.language,
      screen.width + 'x' + screen.height,
      screen.colorDepth,
      new Date().getTimezoneOffset(),
      navigator.hardwareConcurrency || '',
      navigator.deviceMemory || '',
      canvasHash
    ].join('|')

    // Simple hash
    let hash = 0
    for (let i = 0; i < traits.length; i++) {
      hash = ((hash << 5) - hash + traits.charCodeAt(i)) | 0
    }
    return 'fp_' + Math.abs(hash).toString(36)
  } catch {
    return null
  }
}

// Stable per-device id for audit. Combines localStorage + fingerprint.
export function getDeviceId() {
  try {
    let id = localStorage.getItem('cds_device_id')
    if (!id) {
      id = (crypto.randomUUID && crypto.randomUUID()) || `dev_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      localStorage.setItem('cds_device_id', id)
    }
    // Append fingerprint for harder spoofing
    const fp = getBrowserFingerprint()
    return fp ? `${id}::${fp}` : id
  } catch {
    return null
  }
}

export const STATE_CODE_REGEX = /^[A-Z]{2}\/\d{2}[A-Z]\/\d{1,10}$/

// Consistent network error message
export function friendlyNetworkError(msg) {
  const lower = (msg || '').toLowerCase()
  if (lower.includes('failed to fetch') || lower.includes('networkerror')) {
    return 'No internet connection. Check your data or Wi-Fi and try again.'
  }
  if (lower.includes('jwt') || lower.includes('invalid api key') || lower.includes('unauthorized')) {
    return 'Server rejected the connection. Tell an executive or admin to check the setup.'
  }
  return null
}

// Normalize user input — uppercases, strips spaces.
export function normalizeStateCode(s) {
  return (s || '').trim().toUpperCase().replace(/\s+/g, '')
}
