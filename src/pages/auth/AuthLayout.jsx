import { useEffect } from 'react'
import { Link, Outlet, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase.js'

/* ─── Brand constants ────────────────────────────────────────── */
const G       = '#1B6B3A'   // NYSC green
const G_DARK  = '#14522C'   // hover / depth
const G_LIGHT = '#E8F5EE'   // tint for accents
const GOLD    = '#C9973A'
const CREAM   = '#F9F6F0'

/* ─────────────────────────────────────────────────────────────
   ADIRE PATTERN
   Inspired by Adire Eleko (Abeokuta hand-painted resist-dye):
   circular rosette motifs on a diamond-grid lattice
   ───────────────────────────────────────────────────────────── */
function AdirePattern() {
  return (
    <svg
      aria-hidden="true"
      className="absolute inset-0 w-full h-full pointer-events-none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <pattern
          id="adire-bg"
          x="0" y="0"
          width="64" height="64"
          patternUnits="userSpaceOnUse"
        >
          {/* Central rosette — three concentric rings + dot core */}
          <circle cx="32" cy="32" r="24"  fill="none" stroke="white" strokeWidth="0.7" />
          <circle cx="32" cy="32" r="16"  fill="none" stroke="white" strokeWidth="0.7" />
          <circle cx="32" cy="32" r="8"   fill="none" stroke="white" strokeWidth="0.6" />
          <circle cx="32" cy="32" r="2.5" fill="white" />

          {/* Quarter-rosettes at every corner */}
          <circle cx="0"  cy="0"  r="11" fill="none" stroke="white" strokeWidth="0.55" />
          <circle cx="64" cy="0"  r="11" fill="none" stroke="white" strokeWidth="0.55" />
          <circle cx="0"  cy="64" r="11" fill="none" stroke="white" strokeWidth="0.55" />
          <circle cx="64" cy="64" r="11" fill="none" stroke="white" strokeWidth="0.55" />

          {/* Mid-edge accent dots */}
          <circle cx="32" cy="0"  r="1.8" fill="white" />
          <circle cx="32" cy="64" r="1.8" fill="white" />
          <circle cx="0"  cy="32" r="1.8" fill="white" />
          <circle cx="64" cy="32" r="1.8" fill="white" />

          {/* Diamond lattice lines connecting rosette to corners */}
          <line x1="32" y1="8"  x2="56" y2="32" stroke="white" strokeWidth="0.3" />
          <line x1="56" y1="32" x2="32" y2="56" stroke="white" strokeWidth="0.3" />
          <line x1="32" y1="56" x2="8"  y2="32" stroke="white" strokeWidth="0.3" />
          <line x1="8"  y1="32" x2="32" y2="8"  stroke="white" strokeWidth="0.3" />

          {/* Inner diamond detail dots */}
          <circle cx="32" cy="10" r="1.2" fill="white" fillOpacity="0.5" />
          <circle cx="54" cy="32" r="1.2" fill="white" fillOpacity="0.5" />
          <circle cx="32" cy="54" r="1.2" fill="white" fillOpacity="0.5" />
          <circle cx="10" cy="32" r="1.2" fill="white" fillOpacity="0.5" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#adire-bg)" opacity="0.09" />
    </svg>
  )
}

/* ─────────────────────────────────────────────────────────────
   QUEUE ILLUSTRATION
   Flat composition: queue tickets, person silhouettes, cleared badge
   ───────────────────────────────────────────────────────────── */
function QueueIllustration() {
  const faded = 'rgba(255,255,255,0.18)'
  const mid   = 'rgba(255,255,255,0.45)'
  const bright = 'rgba(255,255,255,0.8)'
  const stroke = 'rgba(255,255,255,0.35)'

  return (
    <svg
      viewBox="0 0 300 180"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full max-w-[296px] mx-auto"
      aria-hidden="true"
    >
      {/* ── Queue ticket cards — stacked behind ── */}
      {/* Card 3 (back) */}
      <rect x="30" y="28" width="72" height="44" rx="7"
        fill={faded} stroke="rgba(255,255,255,0.25)" strokeWidth="1" />
      <text x="66" y="52" textAnchor="middle" fill="rgba(255,255,255,0.4)"
        fontSize="18" fontWeight="700">3</text>
      <line x1="42" y1="62" x2="90" y2="62" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
      <rect x="42" y="65" width="30" height="2" rx="1" fill="rgba(255,255,255,0.15)" />

      {/* Card 2 (middle) */}
      <rect x="22" y="20" width="72" height="44" rx="7"
        fill="rgba(255,255,255,0.13)" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
      <text x="58" y="44" textAnchor="middle" fill="rgba(255,255,255,0.5)"
        fontSize="18" fontWeight="700">2</text>
      <line x1="34" y1="54" x2="82" y2="54" stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
      <rect x="34" y="57" width="30" height="2" rx="1" fill="rgba(255,255,255,0.18)" />

      {/* Card 1 (front — active) */}
      <rect x="14" y="12" width="76" height="48" rx="7"
        fill="rgba(255,255,255,0.17)" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" />
      {/* Queue number */}
      <text x="52" y="37" textAnchor="middle" fill="rgba(255,255,255,0.9)"
        fontSize="22" fontWeight="800">01</text>
      {/* Name bar */}
      <rect x="26" y="44" width="44" height="3" rx="1.5" fill="rgba(255,255,255,0.4)" />
      {/* Code bar */}
      <rect x="26" y="51" width="28" height="2.5" rx="1.25" fill="rgba(255,255,255,0.25)" />

      {/* ── Dotted flow arrow ── */}
      <path d="M96 38 Q 130 38 130 70"
        stroke="rgba(255,255,255,0.3)" strokeWidth="1.5"
        strokeDasharray="4 3.5" fill="none"
        markerEnd="url(#arrowW)" />
      <defs>
        <marker id="arrowW" markerWidth="6" markerHeight="6"
          refX="3" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="rgba(255,255,255,0.4)" />
        </marker>
      </defs>

      {/* ── Person silhouettes (queue line) ── */}
      {/* Person 1 — being served */}
      <circle cx="148" cy="74" r="11" fill={bright} />
      <path d="M130 108 Q130 134 148 134 Q166 134 166 108"
        fill={bright} />

      {/* Person 2 — waiting */}
      <circle cx="192" cy="76" r="10" fill={mid} />
      <path d="M175 108 Q175 132 192 132 Q209 132 209 108"
        fill={mid} />

      {/* Person 3 — further back */}
      <circle cx="232" cy="78" r="9" fill={faded} />
      <path d="M216 108 Q216 130 232 130 Q248 130 248 108"
        fill={faded} />

      {/* Subtle queue line */}
      <line x1="130" y1="136" x2="256" y2="136"
        stroke="rgba(255,255,255,0.18)" strokeWidth="1" />

      {/* ── Cleared badge (gold) — floats above person 1 ── */}
      <circle cx="148" cy="52" r="16" fill={GOLD} />
      {/* Checkmark */}
      <path d="M140 52 L146 58 L157 44"
        stroke="white" strokeWidth="2.5"
        strokeLinecap="round" strokeLinejoin="round" />

      {/* ── Clipboard panel (right side) ── */}
      <rect x="260" y="44" width="32" height="72" rx="5"
        fill="rgba(255,255,255,0.1)" stroke="rgba(255,255,255,0.35)" strokeWidth="1.2" />
      {/* Clip */}
      <rect x="269" y="40" width="14" height="8" rx="2.5"
        fill="rgba(255,255,255,0.25)" />
      {/* List rows */}
      {[58, 70, 82, 94, 106].map((y, i) => (
        <g key={y}>
          {/* Check (first two ticked in gold, rest pending) */}
          {i < 2 ? (
            <path d={`M264 ${y-2} L267 ${y+1} L273 ${y-5}`}
              stroke={GOLD} strokeWidth="1.5"
              strokeLinecap="round" strokeLinejoin="round" />
          ) : (
            <circle cx="268" cy={y - 1} r="2"
              fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
          )}
          {/* Line */}
          <line x1="277" y1={y} x2="287" y2={y}
            stroke={i < 2 ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.2)'}
            strokeWidth="1.2" />
        </g>
      ))}

      {/* ── Bottom label ── */}
      <text x="150" y="164" textAnchor="middle"
        fill="rgba(255,255,255,0.28)" fontSize="7.5"
        fontWeight="600" letterSpacing="2.5">
        CDS CLEARANCE DAY MANAGEMENT
      </text>
    </svg>
  )
}

/* ─────────────────────────────────────────────────────────────
   LEFT PANEL
   ───────────────────────────────────────────────────────────── */
function LeftPanel() {
  return (
    <div
      className="hidden lg:flex lg:w-[40%] flex-col relative overflow-hidden select-none"
      style={{ backgroundColor: G }}
    >
      <AdirePattern />

      {/* ── Logo ── */}
      <div className="relative z-10 p-9 pb-0">
        <Link to="/join" className="inline-flex items-center gap-3 group">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors"
            style={{ backgroundColor: 'rgba(255,255,255,0.14)' }}
          >
            <svg
              className="w-5 h-5 text-white"
              viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5"
            >
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>
          <div>
            <div className="font-bold text-sm text-white leading-tight">Eti-Osa 3 Special CDS</div>
            <div className="text-[11px] leading-tight" style={{ color: 'rgba(255,255,255,0.5)' }}>
              Queue Management System
            </div>
          </div>
        </Link>
      </div>

      {/* ── Mid-panel copy ── */}
      <div className="relative z-10 flex-1 flex flex-col justify-center px-9 py-8">
        {/* LGA badge */}
        <div
          className="mb-5 self-start inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold"
          style={{
            backgroundColor: 'rgba(201,151,58,0.18)',
            color: '#E8C06A',
            border: '1px solid rgba(201,151,58,0.35)',
          }}
        >
          <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: GOLD }} />
          NYSC Lagos — Eti-Osa LGA
        </div>

        {/* Tagline */}
        <h1
          className="text-white font-extrabold leading-[1.12] tracking-tight"
          style={{ fontSize: 'clamp(2rem, 2.8vw, 2.6rem)' }}
        >
          Clearance,<br />simplified.
        </h1>

        <p
          className="mt-4 text-sm leading-relaxed max-w-xs"
          style={{ color: 'rgba(255,255,255,0.58)' }}
        >
          Assign queue waves, check in corps members, and manage CDS clearance days — all from one place.
        </p>

        {/* Feature trust list */}
        <ul className="mt-8 space-y-3">
          {[
            'Real-time queue & wave management',
            'Works on slow or intermittent networks',
            'Role-based access for executives',
          ].map(item => (
            <li key={item} className="flex items-start gap-3">
              <span
                className="mt-0.5 w-4 h-4 rounded flex items-center justify-center flex-shrink-0 text-[10px] font-bold"
                style={{ backgroundColor: 'rgba(201,151,58,0.22)', color: GOLD }}
              >
                ✓
              </span>
              <span
                className="text-xs font-medium leading-snug"
                style={{ color: 'rgba(255,255,255,0.62)' }}
              >
                {item}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* ── Illustration ── */}
      <div className="relative z-10 px-6 pb-8">
        <QueueIllustration />
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────
   MOBILE TOP BAR
   ───────────────────────────────────────────────────────────── */
function MobileTopBar() {
  return (
    <div
      className="lg:hidden flex items-center justify-center px-5 flex-shrink-0"
      style={{ backgroundColor: G, height: '52px' }}
    >
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center"
        style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}
      >
        {/* Shield logomark */}
        <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────
   AUTH LAYOUT — root export
   ───────────────────────────────────────────────────────────── */
export default function AuthLayout() {
  const navigate = useNavigate()

  // Already logged in? Check approval status and route accordingly
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return
      const role = session.user?.user_metadata?.role
      if (role === 'super_admin') { navigate('/dashboard', { replace: true }); return }
      try {
        const { data: profile } = await supabase.rpc('get_my_exec_profile')
        if (profile?.status === 'pending' || profile?.status === 'rejected') {
          navigate('/pending-approval', { replace: true })
        } else {
          navigate('/dashboard', { replace: true })
        }
      } catch {
        navigate('/dashboard', { replace: true })
      }
    })
  }, [navigate])

  return (
    <div
      className="min-h-screen flex flex-col lg:flex-row"
      style={{ fontFamily: "'DM Sans', system-ui, -apple-system, sans-serif" }}
    >
      {/* Left panel — desktop only */}
      <LeftPanel />

      {/* Right panel */}
      <div className="flex flex-col flex-1 bg-white lg:w-[60%]">
        {/* Mobile header */}
        <MobileTopBar />

        {/* Form centred in the panel */}
        <div className="flex-1 flex items-center justify-center px-6 py-10 sm:px-10 lg:px-16 xl:px-28">
          <div className="w-full max-w-[420px]">
            <Outlet />
          </div>
        </div>

        {/* Footer */}
        <p className="py-5 px-6 text-center text-xs text-slate-400 flex-shrink-0">
          Eti-Osa 3 Special CDS &mdash; NYSC Lagos State &mdash; All rights reserved
        </p>
      </div>
    </div>
  )
}
