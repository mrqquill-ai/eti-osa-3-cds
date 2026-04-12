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

// Stable per-device id for audit. Persisted in localStorage.
export function getDeviceId() {
  try {
    let id = localStorage.getItem('cds_device_id')
    if (!id) {
      id = (crypto.randomUUID && crypto.randomUUID()) || `dev_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      localStorage.setItem('cds_device_id', id)
    }
    return id
  } catch {
    return null
  }
}

export const STATE_CODE_REGEX = /^[A-Z]{2}\/\d{2}[A-Z]\/\d{1,10}$/

// Normalize user input — uppercases, strips spaces.
export function normalizeStateCode(s) {
  return (s || '').trim().toUpperCase().replace(/\s+/g, '')
}
