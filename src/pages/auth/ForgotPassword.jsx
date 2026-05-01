import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase.js'

const G = '#1B6B3A'

export default function ForgotPassword() {
  const [email,   setEmail]   = useState('')
  const [loading, setLoading] = useState(false)
  const [sent,    setSent]    = useState(false)
  const [error,   setError]   = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { error: authErr } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/login`,
      })
      if (authErr) throw authErr
      setSent(true)
    } catch (err) {
      setError(err.message || 'Could not send reset link. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  /* ── Sent confirmation ── */
  if (sent) {
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
            stroke="currentColor" strokeWidth="1.75"
          >
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-slate-900">Check your inbox</h2>
        <p className="mt-2 text-sm text-slate-500 max-w-[300px] mx-auto leading-relaxed">
          We sent a reset link to{' '}
          <span className="font-semibold text-slate-700">{email}</span>.
          Check your spam folder if it doesn't arrive within a few minutes.
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
      {/* Back link */}
      <Link
        to="/login"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors mb-7"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back to sign in
      </Link>

      {/* Heading */}
      <h2 className="text-[1.65rem] font-bold text-slate-900 tracking-tight leading-tight">
        Reset your password
      </h2>
      <p className="mt-1.5 text-sm text-slate-500 leading-relaxed">
        Enter your registered email and we'll send a reset link.
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

        {/* Email */}
        <div>
          <label htmlFor="fp-email" className="block text-sm font-medium text-slate-700 mb-1.5">
            Email address
          </label>
          <input
            id="fp-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="auth-input"
          />
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
                Sending…
              </span>
            : 'Send reset link'
          }
        </button>
      </form>
    </div>
  )
}
