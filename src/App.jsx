import { Outlet, NavLink } from 'react-router-dom'

export default function App() {
  const linkBase = 'px-2.5 py-1 rounded text-sm font-semibold'
  const linkClass = ({ isActive }) =>
    isActive
      ? `${linkBase} bg-emerald-700 text-white`
      : `${linkBase} text-emerald-100 hover:bg-emerald-800`

  return (
    <div className="min-h-full flex flex-col bg-slate-100">
      <header className="bg-emerald-900 text-white">
        <div className="max-w-5xl mx-auto px-4 py-2 flex items-center justify-between gap-3">
          <div className="font-extrabold tracking-tight text-sm sm:text-base">Eti-Osa 3 Special CDS</div>
          <nav className="flex gap-1">
            <NavLink to="/manager" className={linkClass}>Check in</NavLink>
            <NavLink to="/dashboard" className={linkClass}>Dashboard</NavLink>
          </nav>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  )
}
