import { Outlet, NavLink, useLocation } from 'react-router-dom'
import { useOnlineStatus } from './lib/useOnlineStatus.js'

export default function App() {
  const location = useLocation()
  const online = useOnlineStatus()

  const isCorpsMemberPage =
    location.pathname.startsWith('/status') || location.pathname.startsWith('/join')

  // Active link styles
  const linkBase = 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors'
  const linkClass = ({ isActive }) =>
    isActive
      ? `${linkBase} bg-white/20 text-white`
      : `${linkBase} text-emerald-100 hover:bg-white/10`

  return (
    <div className="min-h-full flex flex-col bg-slate-100">
      {/* Offline banner */}
      {!online && (
        <div className="bg-red-600 text-white text-center text-sm font-bold py-1.5 px-4">
          You are offline. Check your internet connection.
        </div>
      )}

      <header className="bg-emerald-900 text-white shadow-md">
        <div className="max-w-5xl mx-auto px-4 flex items-center justify-between gap-4" style={{ minHeight: '52px' }}>

          {/* Brand */}
          <NavLink
            to={isCorpsMemberPage ? '/join' : '/manager'}
            className="flex items-center gap-2 group"
          >
            <div className="bg-emerald-700 group-hover:bg-emerald-600 rounded-lg p-1.5 transition-colors">
              <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
            </div>
            <div>
              <div className="font-extrabold tracking-tight text-sm leading-tight">Eti-Osa 3 Special CDS</div>
              <div className="text-emerald-300 text-[10px] leading-tight hidden sm:block">Queue Management System</div>
            </div>
          </NavLink>

          {/* Desktop nav — hidden on corps member pages */}
          {!isCorpsMemberPage && (
            <nav className="flex items-center gap-1">
              <NavLink to="/manager" className={linkClass}>
                {/* Check-in icon */}
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <polyline points="16 11 18 13 22 9"/>
                </svg>
                <span>Check In</span>
              </NavLink>

              <NavLink to="/dashboard" className={linkClass}>
                {/* Dashboard icon */}
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="7" height="7" rx="1"/>
                  <rect x="14" y="3" width="7" height="7" rx="1"/>
                  <rect x="3" y="14" width="7" height="7" rx="1"/>
                  <rect x="14" y="14" width="7" height="7" rx="1"/>
                </svg>
                <span>Dashboard</span>
              </NavLink>
            </nav>
          )}

          {/* On corps member pages show a subtle "Executive?" link */}
          {isCorpsMemberPage && (
            <NavLink
              to="/manager"
              className="text-emerald-300 hover:text-white text-xs font-semibold transition-colors hidden sm:block"
            >
              Executive login →
            </NavLink>
          )}
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  )
}
