import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase.js'

const G = '#1B6B3A'

export default function PendingApproval() {
  const navigate = useNavigate()
  const [status,  setStatus]  = useState('pending') // 'pending' | 'rejected'
  const [reason,  setReason]  = useState('')
  const [user,    setUser]    = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function check() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { navigate('/login', { replace: true }); return }

      setUser(session.user)

      try {
        const { data: profile } = await supabase.rpc('get_my_exec_profile')
        if (cancelled) return
        if (!profile) { navigate('/login', { replace: true }); return }

        if (profile.status === 'approved') {
          navigate('/dashboard', { replace: true })
          return
        }

        setStatus(profile.status)
        setReason(profile.rejection_reason || '')
      } catch {
        navigate('/login', { replace: true })
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    check()

    // Poll every 20s — when approved, redirect automatically
    const interval = setInterval(async () => {
      try {
        const { data: profile } = await supabase.rpc('get_my_exec_profile')
        if (cancelled) return
        if (profile?.status === 'approved') {
          navigate('/dashboard', { replace: true })
        } else if (profile?.status === 'rejected') {
          setStatus('rejected')
          setReason(profile.rejection_reason || '')
        }
      } catch {}
    }, 20000)

    return () => { cancelled = true; clearInterval(interval) }
  }, [navigate])

  async function handleSignOut() {
    await supabase.auth.signOut()
    navigate('/login', { replace: true })
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <svg className="w-8 h-8 animate-spin text-emerald-700" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
          </svg>
          <span className="text-sm font-medium">Checking access…</span>
        </div>
      </div>
    )
  }

  if (status === 'rejected') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-5">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow border border-slate-200 p-8 text-center">
          {/* Icon */}
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5 bg-red-50">
            <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>

          <h1 className="text-xl font-bold text-slate-900">Access denied</h1>
          <p className="mt-2 text-sm text-slate-600 leading-relaxed">
            Your account request was not approved.
          </p>

          {reason && (
            <div className="mt-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-800 text-left">
              <span className="font-semibold block mb-0.5">Reason:</span>
              {reason}
            </div>
          )}

          <p className="mt-4 text-xs text-slate-500">
            If you think this is a mistake, please contact your CDS coordinator.
          </p>

          <button
            onClick={handleSignOut}
            className="mt-6 w-full py-3 rounded-xl text-sm font-semibold text-white transition-colors"
            style={{ backgroundColor: G }}
          >
            Sign out
          </button>
        </div>
      </div>
    )
  }

  // status === 'pending'
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-5">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow border border-slate-200 p-8 text-center">
        {/* Pending clock icon */}
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5"
          style={{ backgroundColor: 'rgba(201,151,58,0.12)' }}
        >
          <svg className="w-8 h-8" style={{ color: '#C9973A' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path strokeLinecap="round" d="M12 6v6l4 2" />
          </svg>
        </div>

        <h1 className="text-xl font-bold text-slate-900">Awaiting approval</h1>
        <p className="mt-2 text-sm text-slate-600 leading-relaxed">
          Your account has been submitted and is waiting for review by the CDS coordinator.
        </p>

        {user && (
          <div className="mt-4 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-left">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Signed in as</div>
            <div className="text-sm font-medium text-slate-900 truncate">{user.user_metadata?.full_name || user.email}</div>
            <div className="text-xs text-slate-500 font-mono truncate">{user.email}</div>
          </div>
        )}

        <div className="mt-4 flex items-center gap-2 justify-center text-xs text-slate-500">
          <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: '#C9973A' }} />
          This page checks automatically — you'll be redirected when approved.
        </div>

        <p className="mt-3 text-xs text-slate-500">
          Approvals are usually done within one working day.
        </p>

        <button
          onClick={handleSignOut}
          className="mt-6 w-full py-3 rounded-xl text-sm font-semibold border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
        >
          Sign out
        </button>
      </div>

      <p className="mt-4 text-xs text-slate-400">
        Eti-Osa 3 Special CDS — NYSC Lagos State
      </p>
    </div>
  )
}
