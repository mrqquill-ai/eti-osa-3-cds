import { useState } from 'react'
import { Outlet, NavLink, useLocation } from 'react-router-dom'
import { useOnlineStatus } from './lib/useOnlineStatus.js'

// Icons
function IconCheckin() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <polyline points="16 11 18 13 22 9"/>
    </svg>
  )
}
function IconDashboard() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="7" height="7" rx="1"/>
      <rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="3" y="14" width="7" height="7" rx="1"/>
      <rect x="14" y="14" width="7" height="7" rx="1"/>
    </svg>
  )
}

export default function App() {
  const location = useLocation()
  const online = useOnlineStatus()

  const isCorpsMemberPage =
    location.pathname.startsWith('/status') || location.pathname.startsWith('/join')
  const isExecPage = !isCorpsMemberPage

  // Bottom nav active styles
  const bottomNavClass = ({ isActive }) =>
    `flex flex-col items-center justify-center gap-0.5 flex-1 py-2 text-[11px] font-bold transition-colors ${
      isActive ? 'text-emerald-700' : 'text-slate-500'
    }`

  // Desktop top nav styles
  const topNavClass = ({ isActive }) =>
    `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
      isActive ? 'bg-white/20 text-white' : 'text-emerald-100 hover:bg-white/10'
    }`

  return (
    <div className="min-h-full flex flex-col bg-slate-100">
      {/* Offline banner */}
      {!online && (
        <div className="bg-red-600 text-white text-center text-sm font-bold py-1.5 px-4 z-50">
          You are offline. Check your internet connection.
        </div>
      )}

      {/* ── Top header ── */}
      <header className="bg-emerald-900 text-white shadow-md sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 flex items-center justify-between gap-3" style={{ minHeight: '52px' }}>

          {/* Brand */}
          <NavLink
            to={isCorpsMemberPage ? '/join' : '/manager'}
            className="flex items-center gap-2 min-w-0"
          >
            <div className="bg-emerald-700 rounded-lg p-1.5 flex-shrink-0">
              <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
            </div>
            <div className="min-w-0">
              {/* Shorter on mobile to avoid cramping */}
              <div className="font-extrabold tracking-tight text-sm leading-tight truncate">
                <span className="sm:hidden">Eti-Osa 3 CDS</span>
                <span className="hidden sm:inline">Eti-Osa 3 Special CDS</span>
              </div>
              <div className="text-emerald-300 text-[10px] leading-tight hidden md:block">
                Queue Management System
              </div>
            </div>
          </NavLink>

          {/* Desktop nav links — hidden on mobile (uses bottom nav instead) */}
          {isExecPage && (
            <nav className="hidden sm:flex items-center gap-1">
              <NavLink to="/manager" className={topNavClass}>
                <IconCheckin />
                <span>Check In</span>
              </NavLink>
              <NavLink to="/dashboard" className={topNavClass}>
                <IconDashboard />
                <span>Dashboard</span>
              </NavLink>
            </nav>
          )}

          {/* Corps member pages: subtle exec link on desktop */}
          {isCorpsMemberPage && (
            <NavLink
              to="/manager"
              className="text-emerald-300 hover:text-white text-xs font-semibold transition-colors hidden sm:block whitespace-nowrap"
            >
              Executive login →
            </NavLink>
          )}
        </div>
      </header>

      {/* ── Page content ── */}
      {/* Add bottom padding on mobile exec pages so content doesn't hide behind bottom nav */}
      <main className={`flex-1 ${isExecPage ? 'pb-16 sm:pb-0' : ''}`}>
        <Outlet />
      </main>

      {/* ── Mobile bottom nav — only on exec pages, hidden on desktop ── */}
      {isExecPage && (
        <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-slate-200 shadow-lg flex">
          <NavLink to="/manager" className={bottomNavClass}>
            {({ isActive }) => (
              <>
                <span className={isActive ? 'text-emerald-700' : 'text-slate-400'}>
                  <IconCheckin />
                </span>
                <span>Check In</span>
              </>
            )}
          </NavLink>
          <NavLink to="/dashboard" className={bottomNavClass}>
            {({ isActive }) => (
              <>
                <span className={isActive ? 'text-emerald-700' : 'text-slate-400'}>
                  <IconDashboard />
                </span>
                <span>Dashboard</span>
              </>
            )}
          </NavLink>
        </nav>
      )}
    </div>
  )
}
