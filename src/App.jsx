import { useState, useEffect } from 'react'
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { LayoutGrid, ScanLine, BarChart2, Megaphone, Settings, ChevronLeft, ChevronRight } from 'lucide-react'
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

  /* ── Auth state ── */
  const [user,           setUser]           = useState(null)
  const [sessionOpen,    setSessionOpen]    = useState(false)
  const [showSheet,      setShowSheet]      = useState(false)
  const [sidebarOpen,    setSidebarOpen]    = useState(() => {
    try { return localStorage.getItem('cds_sidebar') !== 'closed' } catch { return true }
  })
  const [showSignOutDlg, setShowSignOutDlg] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user || null)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user || null)
    })
    return () => subscription.unsubscribe()
  }, [])

  /* ── Session-open status ── */
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

  useEffect(() => {
    try { localStorage.setItem('cds_sidebar', sidebarOpen ? 'open' : 'closed') } catch {}
  }, [sidebarOpen])

  async function signOut() {
    setShowSheet(false)
    setShowSignOutDlg(false)
    await supabase.auth.signOut()
    navigate('/login', { replace: true })
  }

  const roleLabel = user?.user_metadata?.role === 'super_admin'
    ? 'Super Admin'
    : (user?.user_metadata?.role
        ? user.user_metadata.role.charAt(0).toUpperCase() + user.user_metadata.role.slice(1)
        : 'Executive')

  /* ─────────────────────────────────────────── */
  return (
    <div className="min-h-screen flex flex-col bg-slate-50">

      {/* ── Offline banner ── */}
      {!online && (
        <div className="fixed top-0 left-0 right-0 z-[80] bg-red-600 text-white text-center text-sm font-bold py-1.5 px-4">
          You are offline. Check your internet connection.
        </div>
      )}

      {/* ══════════════════════════════════════════════════
          EXEC PAGES
          ══════════════════════════════════════════════════ */}
      {isExecPage && (
        <>
          {/* ── DESKTOP SIDEBAR (lg+) ── */}
          <aside
            className="hidden lg:flex lg:fixed lg:inset-y-0 lg:left-0 flex-col z-50 transition-all duration-200"
            style={{ backgroundColor: G, borderRight: '1px solid rgba(0,0,0,0.12)', width: sidebarOpen ? '240px' : '64px', cursor: sidebarOpen ? 'default' : 'pointer' }}
            onClick={() => { if (!sidebarOpen) setSidebarOpen(true) }}
          >
            {/* Logo row */}
            <div className="flex items-center px-3.5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', minHeight: '64px' }}>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}>
                <ShieldMark className="w-[18px] h-[18px] text-white" />
              </div>
              {sidebarOpen && (
                <>
                  <div className="flex-1 min-w-0 ml-3">
                    <div className="font-bold text-white text-sm leading-tight">CDS Manager</div>
                    <div className="text-[10px] leading-tight" style={{ color: 'rgba(255,255,255,0.45)' }}>Eti-Osa 3 Special CDS</div>
                  </div>
                  <button
                    onClick={() => setSidebarOpen(false)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg flex-shrink-0 opacity-40 hover:opacity-100 transition-opacity ml-2"
                    style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}
                    title="Collapse"
                  >
                    <ChevronLeft className="w-4 h-4 text-white" />
                  </button>
                </>
              )}
            </div>

            {/* Session status — open only */}
            {sidebarOpen && (
              <div className="px-5 py-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: sessionOpen ? '#4ade80' : 'rgba(255,255,255,0.3)' }} />
                  <span className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.6)' }}>
                    {sessionOpen ? 'Registration open' : 'Registration closed'}
                  </span>
                </div>
              </div>
            )}

            {/* Nav — full labels when open, icon-only when closed */}
            <nav className={`flex-1 overflow-y-auto py-3 space-y-0.5 ${sidebarOpen ? 'px-3' : 'px-2'}`}
              onClick={e => e.stopPropagation()}>
              {TABS.map(({ to, icon: Icon, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  title={!sidebarOpen ? label : undefined}
                  className={`flex items-center rounded-xl text-sm font-semibold transition-all duration-150 ${sidebarOpen ? 'gap-3 px-3 py-2.5' : 'justify-center py-3'}`}
                  style={({ isActive }) => ({
                    backgroundColor: isActive ? 'rgba(255,255,255,0.15)' : 'transparent',
                    color: isActive ? 'white' : 'rgba(255,255,255,0.6)',
                  })}
                >
                  {({ isActive }) => (
                    <>
                      <Icon className="w-[18px] h-[18px] flex-shrink-0"
                        style={{ color: isActive ? 'white' : 'rgba(255,255,255,0.5)' }} />
                      {sidebarOpen && <span>{label}</span>}
                      {sidebarOpen && isActive && (
                        <span className="ml-auto w-1.5 h-1.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: '#4ade80' }} />
                      )}
                    </>
                  )}
                </NavLink>
              ))}
            </nav>

            {/* Expand button — bottom of closed sidebar */}
            {!sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(true)}
                className="mx-2 mb-3 py-2.5 flex items-center justify-center rounded-xl opacity-40 hover:opacity-100 transition-opacity"
                style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
                title="Expand sidebar"
              >
                <ChevronRight className="w-4 h-4 text-white" />
              </button>
            )}

            {/* User — full card when open, avatar only when closed */}
            {user && (
              <div className={`${sidebarOpen ? 'px-4 py-4' : 'px-2 pb-4'}`}
                style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                {sidebarOpen ? (
                  <>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                        style={{ backgroundColor: GOLD, color: '#1A1A1A' }}>
                        {initials(user)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-white truncate leading-tight">
                          {user?.user_metadata?.full_name || 'Admin'}
                        </div>
                        <div className="text-[10px] mt-0.5 truncate" style={{ color: 'rgba(255,255,255,0.45)' }}>
                          {roleLabel}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => setShowSignOutDlg(true)}
                      className="mt-3 w-full text-xs font-semibold py-2 rounded-lg transition-colors"
                      style={{ color: 'rgba(255,255,255,0.55)', backgroundColor: 'rgba(255,255,255,0.07)' }}
                    >
                      Sign out
                    </button>
                  </>
                ) : (
                  <button
                    onClick={e => { e.stopPropagation(); setShowSignOutDlg(true) }}
                    className="flex justify-center w-full pt-2 pb-1 transition-opacity hover:opacity-80"
                    title="Sign out"
                  >
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold"
                      style={{ backgroundColor: GOLD, color: '#1A1A1A' }}>
                      {initials(user)}
                    </div>
                  </button>
                )}
              </div>
            )}
          </aside>

          {/* ── MOBILE: single slim header (Band 1) ──
              Group name + live status left; role chip + avatar right.
              Neutral surface: solid brand green is reserved for the
              primary action button. Identity appears exactly once. */}
          <header
            className="lg:hidden fixed left-0 right-0 z-50 flex items-center px-4 gap-2"
            style={{
              backgroundColor: 'var(--surface-raised)',
              height: '56px',
              top: 0,
              paddingTop: 'env(safe-area-inset-top)',
              borderBottom: '1px solid var(--line)',
            }}
          >
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="font-bold text-sm tracking-tight truncate" style={{ color: 'var(--text-primary)' }}>
                Eti-Osa 3 Special CDS
              </span>
              <span
                className="flex items-center gap-1 flex-shrink-0 text-xs font-semibold"
                style={{ color: sessionOpen ? 'var(--status-served)' : 'var(--text-secondary)' }}
              >
                <span className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: sessionOpen ? 'var(--status-served)' : 'var(--line)' }} />
                {sessionOpen ? 'Open' : 'Closed'}
              </span>
            </div>
            {user && (
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <span
                  className="text-[10px] font-bold px-2 py-1 rounded-full truncate max-w-[110px]"
                  style={{
                    backgroundColor: roleLabel === 'Super Admin' ? 'var(--accent-gold-tint)' : 'var(--brand-green-tint)',
                    color: roleLabel === 'Super Admin' ? 'var(--accent-gold)' : 'var(--brand-green)',
                  }}
                >
                  {roleLabel === 'Super Admin' ? '⚡ Super Admin' : roleLabel}
                </span>
                <button
                  onClick={() => setShowSheet(true)}
                  aria-label="Account menu"
                  className="w-11 h-11 -mr-1.5 rounded-full flex items-center justify-center transition-opacity active:opacity-70"
                >
                  <span
                    className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold"
                    style={{ backgroundColor: 'var(--accent-gold)', color: 'var(--surface-raised)' }}
                  >
                    {initials(user)}
                  </span>
                </button>
              </div>
            )}
          </header>
        </>
      )}

      {/* ══════════════════════════════════════════════════
          CORPS MEMBER PAGES — simple green header
          ══════════════════════════════════════════════════ */}
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
          </div>
        </header>
      )}

      {/* ── Page content ── */}
      <main
        className={`flex-1 transition-all duration-200 ${isExecPage ? `pt-[56px] pb-[72px] lg:pt-0 lg:pb-0 ${sidebarOpen ? 'lg:pl-[240px]' : 'lg:pl-[64px]'}` : ''}`}
      >
        <Outlet />
      </main>

      {/* ── MOBILE bottom nav (hidden on desktop) ── */}
      {isExecPage && (
        <nav
          className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-white flex"
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
                  <Icon className="w-5 h-5" style={{ color: isActive ? G : '#8C8880' }} />
                  <span className="text-[11px]" style={{
                    color:      isActive ? G : '#8C8880',
                    fontWeight: isActive ? 600 : 500,
                  }}>
                    {label}
                  </span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
      )}

      {/* ── MOBILE account bottom sheet ── */}
      {showSheet && (
        <div className="lg:hidden fixed inset-0 z-[100]">
          <div
            className="absolute inset-0"
            style={{ backgroundColor: 'rgba(0,0,0,0.35)' }}
            onClick={() => setShowSheet(false)}
          />
          <div
            className="imp-sheet-in absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl px-6 pt-6"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}
          >
            <div className="w-10 h-1 rounded-full bg-slate-200 mx-auto mb-5" />
            <div className="flex items-center gap-3 mb-6">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center text-base font-bold flex-shrink-0"
                style={{ backgroundColor: GOLD, color: '#1A1A1A' }}
              >
                {initials(user)}
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-slate-900 truncate">
                  {user?.user_metadata?.full_name || 'Admin'}
                </div>
                <div className="text-xs text-slate-500 truncate mt-0.5">{user?.email}</div>
                <span
                  className="inline-block mt-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: 'rgba(27,107,58,0.1)', color: G }}
                >
                  {roleLabel}
                </span>
              </div>
            </div>
            <button
              onClick={() => { setShowSheet(false); setShowSignOutDlg(true) }}
              className="w-full py-3 rounded-xl text-sm font-semibold transition-colors active:opacity-80"
              style={{ backgroundColor: 'rgba(192,57,43,0.08)', color: '#C0392B' }}
            >
              Sign out
            </button>
          </div>
        </div>
      )}
      {/* ── Sign out confirmation dialog ── */}
      {showSignOutDlg && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center px-5 imp-fade-in"
          style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
          onClick={() => setShowSignOutDlg(false)}
        >
          <div
            className="imp-pop-in bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6"
            onClick={e => e.stopPropagation()}
          >
            <div className="w-11 h-11 rounded-full flex items-center justify-center mb-4"
              style={{ backgroundColor: 'rgba(192,57,43,0.08)' }}>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="#C0392B" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h6a2 2 0 012 2v1" />
              </svg>
            </div>
            <h3 className="text-base font-bold" style={{ color: '#0F172A' }}>Sign out of CDS Manager?</h3>
            <p className="text-sm mt-1.5 leading-relaxed" style={{ color: '#64748B' }}>
              You'll need to sign back in to manage the clearance queue. Any active session will continue running.
            </p>
            <div className="flex gap-3 mt-5">
              <button
                onClick={signOut}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-opacity active:opacity-80"
                style={{ border: '1.5px solid #E2E8F0', color: '#C0392B', backgroundColor: 'rgba(192,57,43,0.04)' }}
              >
                Sign out
              </button>
              <button
                onClick={() => setShowSignOutDlg(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-opacity active:opacity-80"
                style={{ backgroundColor: G }}
              >
                Stay signed in
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
