import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { supabase } from '../../lib/supabase.js'

const G    = '#1B6B3A'
const GOLD = '#C9973A'

const ROLES = [
  { id: 'executive',  label: 'Group Executive' },
  { id: 'welfare',    label: 'Welfare Officer' },
  { id: 'pro',        label: 'PRO' },
  { id: 'other',      label: 'Other' },
]

const INITIAL = {
  fullName:        '',
  stateCode:       '',
  email:           '',
  role:            '',
  password:        '',
  confirmPassword: '',
}

export default function Signup() {
  const [form,        setForm]        = useState(INITIAL)
  const [showPw,      setShowPw]      = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState('')
  const [success,     setSuccess]     = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (!form.role) {
      setError('Please select your role before continuing.')
      return
    }
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match. Please check and try again.')
      return
    }

    setLoading(true)
    try {
      const { error: authErr } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: {
          data: {
            full_name:  form.fullName,
            state_code: form.stateCode,
            role:       form.role,
          }
        }
      })
      if (authErr) throw authErr
      setSuccess(true)
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  /* ── Success state ── */
  if (success) {
    return (
      <div className="text-center py-6">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5"
          style={{ backgroundColor: '#E8F5EE' }}
        >
          <svg
            className="w-8 h-8"
            style={{ color: G }}
            fill="none" viewBox="0 0 24 24"
            stroke="currentColor" strokeWidth="2.5"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-slate-900">Request submitted</h2>
        <p className="mt-2 text-sm text-slate-500 max-w-[300px] mx-auto leading-relaxed">
          Your account request has been sent. The CDS coordinator will review and
          activate your access — usually within one working day.
        </p>
        <Link
          to="/login"
          className="inline-flex items-center gap-1.5 mt-7 text-sm font-semibold transition-colors hover:underline"
          style={{ color: G }}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to sign in
        </Link>
      </div>
    )
  }

  /* ── Form ── */
  return (
    <div>
      {/* Heading */}
      <h2 className="text-[1.65rem] font-bold text-slate-900 tracking-tight leading-tight">
        Create your account
      </h2>
      <p className="mt-1.5 text-sm text-slate-500">
        Admin and executive access only
      </p>

      {/* Error banner */}
      {error && (
        <div className="mt-5 flex items-start gap-2.5 px-4 py-3 rounded-lg bg-red-50 border border-red-200">
          <svg
            className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"
          >
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M12 9v3m0 3h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <span className="text-sm text-red-700">{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="mt-7 space-y-5">

        {/* Full name */}
        <div>
          <label htmlFor="su-name" className="block text-sm font-medium text-slate-700 mb-1.5">
            Full name
          </label>
          <input
            id="su-name"
            type="text"
            required
            autoComplete="name"
            value={form.fullName}
            onChange={e => set('fullName', e.target.value)}
            placeholder="e.g. Chukwuemeka Nwosu"
            className="auth-input"
          />
        </div>

        {/* State code */}
        <div>
          <label htmlFor="su-statecode" className="block text-sm font-medium text-slate-700 mb-1.5">
            State code
          </label>
          <input
            id="su-statecode"
            type="text"
            required
            value={form.stateCode}
            onChange={e => set('stateCode', e.target.value.toUpperCase())}
            placeholder="LA/24A/1234"
            maxLength={20}
            spellCheck={false}
            className="auth-input font-mono tracking-wider"
          />
          <p className="mt-1.5 text-xs text-slate-400 flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/><path d="M12 16v-4m0-4h.01"/>
            </svg>
            Your NYSC state code, e.g. LA/24A/1234
          </p>
        </div>

        {/* Email */}
        <div>
          <label htmlFor="su-email" className="block text-sm font-medium text-slate-700 mb-1.5">
            Email address
          </label>
          <input
            id="su-email"
            type="email"
            required
            autoComplete="email"
            value={form.email}
            onChange={e => set('email', e.target.value)}
            placeholder="you@example.com"
            className="auth-input"
          />
        </div>

        {/* Role chip selector */}
        <div>
          <span className="block text-sm font-medium text-slate-700 mb-2">
            Your role
          </span>
          <div className="flex flex-wrap gap-2">
            {ROLES.map(r => {
              const active = form.role === r.id
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => set('role', r.id)}
                  className="px-4 py-2 rounded-full text-sm font-medium transition-all duration-150 border"
                  style={{
                    backgroundColor: active ? 'rgba(201,151,58,0.1)' : 'white',
                    borderColor:      active ? GOLD : '#D1D5DB',
                    color:            active ? '#7A5620' : '#374151',
                    boxShadow:        active ? `0 0 0 2px rgba(201,151,58,0.25)` : 'none',
                  }}
                >
                  {active && (
                    <span className="inline-block w-1.5 h-1.5 rounded-full mr-1.5 mb-0.5 align-middle"
                      style={{ backgroundColor: GOLD }} />
                  )}
                  {r.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Password */}
        <div>
          <label htmlFor="su-password" className="block text-sm font-medium text-slate-700 mb-1.5">
            Password
          </label>
          <div className="relative">
            <input
              id="su-password"
              type={showPw ? 'text' : 'password'}
              required
              minLength={8}
              autoComplete="new-password"
              value={form.password}
              onChange={e => set('password', e.target.value)}
              placeholder="Min. 8 characters"
              className="auth-input pr-11"
            />
            <button
              type="button"
              onClick={() => setShowPw(v => !v)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
              aria-label={showPw ? 'Hide password' : 'Show password'}
            >
              {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {/* Password strength bar */}
          {form.password.length > 0 && (
            <div className="mt-2 flex gap-1">
              {[1, 2, 3, 4].map(i => {
                const strength = Math.min(4, Math.floor(form.password.length / 3))
                return (
                  <div
                    key={i}
                    className="flex-1 h-1 rounded-full transition-colors duration-300"
                    style={{
                      backgroundColor: i <= strength
                        ? strength <= 1 ? '#EF4444'
                          : strength <= 2 ? '#F97316'
                          : strength <= 3 ? '#EAB308'
                          : G
                        : '#E5E7EB',
                    }}
                  />
                )
              })}
            </div>
          )}
        </div>

        {/* Confirm password */}
        <div>
          <label htmlFor="su-confirm" className="block text-sm font-medium text-slate-700 mb-1.5">
            Confirm password
          </label>
          <div className="relative">
            <input
              id="su-confirm"
              type={showConfirm ? 'text' : 'password'}
              required
              autoComplete="new-password"
              value={form.confirmPassword}
              onChange={e => set('confirmPassword', e.target.value)}
              placeholder="••••••••"
              className="auth-input pr-11"
            />
            <button
              type="button"
              onClick={() => setShowConfirm(v => !v)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
              aria-label={showConfirm ? 'Hide' : 'Show'}
            >
              {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {/* Match indicator */}
          {form.confirmPassword.length > 0 && (
            <p
              className="mt-1.5 text-xs flex items-center gap-1.5"
              style={{ color: form.password === form.confirmPassword ? G : '#EF4444' }}
            >
              {form.password === form.confirmPassword
                ? <><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>Passwords match</>
                : <><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>Passwords do not match</>
              }
            </p>
          )}
        </div>

        {/* CTA */}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 rounded-lg text-white text-sm font-semibold tracking-wide transition-all duration-150 disabled:opacity-70"
          style={{
            backgroundColor: G,
            boxShadow: loading ? 'none' : '0 2px 8px rgba(27,107,58,0.3)',
          }}
        >
          {loading
            ? <span className="flex items-center justify-center gap-2">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>
                Creating account…
              </span>
            : 'Create account'
          }
        </button>

        {/* Disclaimer */}
        <p className="text-center text-xs text-slate-400 leading-relaxed -mt-1">
          Access is subject to approval by the CDS coordinator.
        </p>
      </form>

      {/* Sign-in link */}
      <div className="mt-6 pt-5 border-t border-slate-100 text-center">
        <p className="text-xs text-slate-400">
          Already have an account?{' '}
          <Link
            to="/login"
            className="font-semibold transition-colors hover:underline"
            style={{ color: G }}
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
