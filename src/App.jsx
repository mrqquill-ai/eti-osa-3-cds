import { Outlet, NavLink, useLocation } from 'react-router-dom'
import { useOnlineStatus } from './lib/useOnlineStatus.js'

export default function App() {
  const location = useLocation()
  const online = useOnlineStatus()
  const isCorpsMemberPage = location.pathname.startsWith('/status') || location.pathname.startsWith('/join')

  const linkBase = 'px-2.5 py-1 rounded text-sm font-semibold'
  const linkClass = ({ isActive }) =>
    isActive
      ? `${linkBase} bg-emerald-700 text-white`
      : `${linkBase} text-emerald-100 hover:bg-emerald-800`

  return (
    <div className="min-h-full flex flex-col bg-slate-100">
      {!online && (
        <div className="bg-red-600 text-white text-center text-sm font-bold py-1.5 px-4">
          You are offline. Check your internet connection.
        </div>
      )}
      <header className="bg-emerald-900 text-white">
        <div className="max-w-5xl mx-auto px-4 py-2 flex items-center justify-between gap-3">
          <div className="font-extrabold tracking-tight text-sm sm:text-base">Eti-Osa 3 Special CDS</div>
          {!isCorpsMemberPage && (
            <nav className="flex gap-1">
              <NavLink to="/manager" className={linkClass}>Check in</NavLink>
              <NavLink to="/dashboard" className={linkClass}>Dashboard</NavLink>
            </nav>
          )}
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  )
}
