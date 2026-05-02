import { useState, useEffect } from 'react'
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { LayoutGrid, ScanLine, BarChart2, Megaphone, Settings, Shield } from 'lucide-react'
import { supabase } from './lib/supabase.js'
import { useOnlineStatus } from './lib/useOnlineStatus.js'

/* ── Brand constants ── */
const G    = '#1B6B3A'
const GOLD = '#A67C2E'

/* ── Shield logomark ── */
function ShieldMark({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  )
}

/* ── Helper: user initials ── */
function initials(user) {
  const name = user?.user_metadata?.full_name
  if (name) {
    const parts = name.trim().split(/\s+/)
    return parts.length >= 2
      ? (parts[0][0] + parts[1][0]).toUpperCase()
      : parts[0][0].toUpperCase()
  }
  return (user?.email?.[0] || '?').toUpperCase()
}

/* ── Tabs config ── */
const TABS = [
  { to: '/dashboard', icon: LayoutGrid, label: 'Dashboard' },
  { to: '/manager',   icon: ScanLine,   label: 'Check In'  },
  { to: '/stats',     icon: BarChart2,  label: 'Stats'     },
  { to: '/announce',  icon: Megaphone,  label: 'Announce'  },
  { to: '/settings',  icon: Settings,   label: 'Settings'  },
]

export default function App() {
  const location  = useLocation()
  const navigate  = useNavigate()
  const online    = useOnlineStatus()

  const isCorpsMemberPage =
    location.pathname.startsWith('/status') ||
    location.pathname.startsWith('/join')
  const isExecPage = !isCorpsMemberPage

  /* ── Auth state (exec pages only) ── */
  const [user,        setUser]        = useState(null)
  const [sessionOpen, setSessionOpen] = useState(false)
  const [showSheet,   setShowSheet]   = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user || null)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user || null)
    })
    return () => subscription.unsubscribe()
  }, [])

  /* ── Session-open status for session bar ── */
  useEffect(() => {
    if (!isExecPage) return
    supabase
      .from('session_settings')
      .select('registration_open')
      .eq('id', 1)
      .single()
      .then(({ data }) => { if (data) setSessionOpen(data.registration_open) })

    const ch = supabase
      .channel('app-session-bar')
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public',
        table: 'session_settings', filter: 'id=eq.1'
      }, payload => setSessionOpen(payload.new.registration_open))
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [isExecPage])

  async function signOut() {
    setShowSheet(false)
    await supabase.auth.signOut()
    navigate('/login', { replace: true })
  }

  const roleLabel  = user?.user_metadata?.role === 'super_admin'
    ? 'Super Admin'
    : (user?.user_metadata?.role
        ? user.user_metadata.role.charAt(0).toUpperCase() + user.user_metadata.role.slice(1)
        : 'Executive')

  /* ─────────────────────────────────────────── */
  return (
    <div className="min-h-screen flex flex-col bg-slate-50">

      {/* ── Offline banner ── */}
      {!online && (
        <div className="bg-destructive text-white text-center text-sm font-bold py-1.5 px-4 z-[60]">
          You are offline. Check your internet connection.
        </div>
      )}

      {/* ═══════════════════════════════════════════
          EXEC PAGES — new fixed header + session bar
          ═══════════════════════════════════════════ */}
      {isExecPage && (
        <>
          {/* Fixed top header — 52 px */}
          <header
            className="fixed left-0 right-0 z-50 flex items-center px-4 gap-3"
            style={{ backgroundColor: G, height: '52px', top: 0, paddingTop: 'env(safe-area-inset-top)' }}
          >
            {/* Logomark + wordmark */}
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}>
                <ShieldMark className="w-4 h-4 text-white" />
              </div>
              <span className="font-bold text-white text-sm tracking-tight">CDS Manager</span>
            </div>

            {/* User avatar — opens bottom sheet */}
            {user && (
              <button
                onClick={() => setShowSheet(true)}
                aria-label="Account menu"
                className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 transition-opacity active:opacity-70"
                style={{ backgroundColor: GOLD, color: '#1A1A1A' }}
              >
                {initials(user)}
              </button>
            )}
          </header>

          {/* Sticky session bar — sits flush below header */}
          <div
            className="fixed left-0 right-0 z-40 bg-white"
            style={{ top: '52px', borderBottom: '1px solid #E0DDD6' }}
          >
            {/* Session name + open/closed badge */}
            <div className="flex items-center justify-between gap-3 px-4 h-11">
              <span className="text-sm font-semibold truncate" style={{ color: '#1A1A1A' }}>
                Eti-Osa 3 Special CDS
              </span>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: sessionOpen ? G : '#8C8880' }}
                />
                <span
                  className="text-xs font-medium"
                  style={{ color: sessionOpen ? G : '#8C8880' }}
                >
                  {sessionOpen ? 'Open' : 'Closed'}
                </span>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ═══════════════════════════════════════════
          CORPS MEMBER PAGES — simple green header
          ═══════════════════════════════════════════ */}
      {isCorpsMemberPage && (
        <header className="sticky top-0 z-40 text-white shadow-sm" style={{ backgroundColor: G }}>
          <div className="max-w-2xl mx-auto px-4 flex items-center justify-between gap-3" style={{ minHeight: '52px' }}>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}>
                <ShieldMark className="w-3.5 h-3.5 text-white" />
              </div>
              <div>
                <div className="font-bold text-sm leading-tight">Eti-Osa 3 CDS</div>
                <div className="text-[10px] leading-tight" style={{ color: 'rgba(255,255,255,0.6)' }}>
                  Queue Management
                </div>
              </div>
            </div>
            <a
              href="/login"
              className="text-xs font-semibold transition-colors"
              style={{ color: 'rgba(255,255,255,0.7)' }}
            >
              Executive login →
            </a>
          </div>
        </header>
      )}

      {/* ── Page content ── */}
      <main className={`flex-1 ${isExecPage ? 'pt-[96px] pb-[72px]' : ''}`}>
        <Outlet />
      </main>

      {/* ── 4-tab bottom nav (exec pages only) ── */}
      {isExecPage && (
        <nav
          className="fixed bottom-0 left-0 right-0 z-50 bg-white flex"
          style={{
            borderTop: '1px solid #E0DDD6',
            paddingBottom: 'env(safe-area-inset-bottom)',
          }}
        >
          {TABS.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[56px] transition-colors"
            >
              {({ isActive }) => (
                <>
                  <Icon
                    className="w-5 h-5"
                    style={{ color: isActive ? G : '#8C8880' }}
                  />
                  <span
                    className="text-[11px]"
                    style={{
                      color:      isActive ? G : '#8C8880',
                      fontWeight: isActive ? 600 : 500,
                    }}
                  >
                    {label}
                  </span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
      )}

      {/* ── User account bottom sheet ── */}
      {showSheet && (
        <div className="fixed inset-0 z-[100]">
          {/* Scrim */}
          <div
            className="absolute inset-0"
            style={{ backgroundColor: 'rgba(0,0,0,0.35)' }}
            onClick={() => setShowSheet(false)}
          />
          {/* Sheet */}
          <div
            className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl px-6 pt-6"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}
          >
            {/* Drag handle */}
            <div className="w-10 h-1 rounded-full bg-line mx-auto mb-5" />

            {/* Account info */}
            <div className="flex items-center gap-3 mb-6">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center text-base font-bold flex-shrink-0"
                style={{ backgroundColor: GOLD, color: '#1A1A1A' }}
              >
                {initials(user)}
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-ink truncate">
                  {user?.user_metadata?.full_name || 'Admin'}
                </div>
                <div className="text-xs text-muted truncate mt-0.5">{user?.email}</div>
                <span
                  className="inline-block mt-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: 'rgba(27,107,58,0.1)', color: G }}
                >
                  {roleLabel}
                </span>
              </div>
            </div>

            {/* Sign out */}
            <button
              onClick={signOut}
              className="w-full py-3 rounded-xl text-sm font-semibold transition-colors active:opacity-80"
              style={{ backgroundColor: 'rgba(192,57,43,0.08)', color: '#C0392B' }}
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
