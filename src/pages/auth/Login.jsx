import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'

const G = '#1B6B3A'

export default function Login() {
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [showPw,   setShowPw]   = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      // TODO: replace with supabase.auth.signInWithPassword({ email, password })
      await new Promise(r => setTimeout(r, 900))
      // navigate('/dashboard')
    } catch (err) {
      setError(err.message || 'Invalid email or password. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      {/* Heading */}
      <h2 className="text-[1.65rem] font-bold text-slate-900 tracking-tight leading-tight">
        Welcome back
      </h2>
      <p className="mt-1.5 text-sm text-slate-500">
        Sign in to your admin account
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

      {/* Form */}
      <form onSubmit={handleSubmit} noValidate className="mt-7 space-y-5">

        {/* Email */}
        <div>
          <label htmlFor="login-email" className="block text-sm font-medium text-slate-700 mb-1.5">
            Email address
          </label>
          <input
            id="login-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="auth-input"
          />
        </div>

        {/* Password */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label htmlFor="login-password" className="text-sm font-medium text-slate-700">
              Password
            </label>
            <Link
              to="/forgot-password"
              className="text-xs font-semibold transition-colors hover:underline"
              style={{ color: G }}
            >
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <input
              id="login-password"
              type={showPw ? 'text' : 'password'}
              required
              autoComplete="current-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
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
        </div>

        {/* CTA */}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 rounded-lg text-white text-sm font-semibold tracking-wide transition-all duration-150 mt-1 disabled:opacity-70"
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
                Signing in…
              </span>
            : 'Sign in'
          }
        </button>
      </form>

      {/* Divider + signup nudge */}
      <div className="mt-7 pt-6 border-t border-slate-100 text-center">
        <p className="text-xs text-slate-400">
          Need an account?{' '}
          <Link
            to="/signup"
            className="font-semibold transition-colors hover:underline"
            style={{ color: G }}
          >
            Request access
          </Link>
        </p>
      </div>
    </div>
  )
}
