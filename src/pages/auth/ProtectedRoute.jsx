import { useState, useEffect } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { supabase } from '../../lib/supabase.js'

export default function ProtectedRoute() {
  const [loading, setLoading] = useState(true)
  const [authorized, setAuthorized] = useState(false)
  const [redirectPath, setRedirectPath] = useState(null)

  useEffect(() => {
    async function checkAuth() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        
        if (!session) {
          setRedirectPath('/login')
          return
        }

        const role = session.user?.user_metadata?.role
        if (role === 'super_admin') {
          setAuthorized(true)
          return
        }

        // For executives, check approval status
        const { data: profile, error } = await supabase.rpc('get_my_exec_profile')
        
        if (error || !profile) {
          setRedirectPath('/pending-approval')
          return
        }

        if (profile.status === 'approved') {
          setAuthorized(true)
        } else {
          setRedirectPath('/pending-approval')
        }
      } catch (err) {
        console.error('Auth check error:', err)
        setRedirectPath('/login')
      } finally {
        setLoading(false)
      }
    }

    checkAuth()
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <svg className="w-8 h-8 animate-spin text-[#1B6B3A]" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
        </svg>
      </div>
    )
  }

  if (redirectPath) {
    return <Navigate to={redirectPath} replace />
  }

  return authorized ? <Outlet /> : <Navigate to="/login" replace />
}
