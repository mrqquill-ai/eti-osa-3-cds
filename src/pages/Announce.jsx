import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Megaphone, X } from 'lucide-react'
import { supabase } from '../lib/supabase.js'

const G    = '#1B6B3A'
const MUTED = '#64748B'
const INK   = '#0F172A'
const LINE  = '#E2E8F0'
const AMBER = '#F59B0A'

const MAX_CHARS = 300

const TEMPLATES = [
  { label: '☕ Break time',          text: 'We are on a short break. Please stay in your seats. We will resume shortly.' },
  { label: '📋 Report to desk',      text: 'All corps members in the current wave, please report to the desk for documentation.' },
  { label: '🚫 Registration closed', text: 'Registration is now closed. If you have not checked in yet, please see an executive.' },
  { label: '✅ Clearance complete',   text: 'Today\'s CDS clearance is complete. Thank you for your cooperation. Have a great day!' },
]

export default function AnnouncePage() {
  const navigate = useNavigate()

  /* ── Auth guard ── */
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) navigate('/login', { replace: true })
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session) navigate('/login', { replace: true })
    })
    return () => subscription.unsubscribe()
  }, [navigate])

  const [current, setCurrent] = useState('')   // live announcement from DB
  const [draft,   setDraft]   = useState('')
  const [busy,    setBusy]    = useState(false)
  const [toast,   setToast]   = useState('')

  function flash(msg) { setToast(msg); setTimeout(() => setToast(''), 3000) }

  /* ── Load current announcement ── */
  useEffect(() => {
    supabase.from('session_settings').select('announcement').eq('id', 1).single()
      .then(({ data }) => { if (data) setCurrent(data.announcement || '') })

    const ch = supabase
      .channel('announce-page')
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public',
        table: 'session_settings', filter: 'id=eq.1',
      }, payload => setCurrent(payload.new.announcement || ''))
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [])

  /* ── Publish ── */
  async function publish() {
    if (!draft.trim()) return
    setBusy(true)
    const { error } = await supabase
      .from('session_settings')
      .update({ announcement: draft.trim() })
      .eq('id', 1)
    setBusy(false)
    if (error) { flash('Failed to publish: ' + error.message); return }
    flash('Announcement published!')
    setDraft('')
  }

  /* ── Clear ── */
  async function clearAnnouncement() {
    setBusy(true)
    await supabase.from('session_settings').update({ announcement: '' }).eq('id', 1)
    setBusy(false)
    flash('Announcement cleared.')
  }

  const remaining = MAX_CHARS - draft.length

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-5">

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold" style={{ color: INK }}>Announcements</h1>
        <p className="text-sm mt-0.5" style={{ color: MUTED }}>
          Broadcast a message to all corps members' status screens
        </p>
      </div>

      {/* ── Live announcement preview ── */}
      {current ? (
        <div
          className="rounded-2xl p-4"
          style={{ backgroundColor: 'rgba(245,155,10,0.08)', border: `1px solid rgba(245,155,10,0.3)` }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <Megaphone className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: AMBER }} />
              <div>
                <p className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: AMBER }}>
                  Live now
                </p>
                <p className="text-sm leading-snug" style={{ color: INK }}>{current}</p>
              </div>
            </div>
            <button
              onClick={clearAnnouncement}
              disabled={busy}
              aria-label="Clear announcement"
              className="flex-shrink-0 p-1 rounded-lg transition-colors active:opacity-70 disabled:opacity-40"
              style={{ color: MUTED }}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : (
        <div
          className="rounded-2xl p-4 text-center"
          style={{ backgroundColor: '#F8FAFC', border: `1px dashed ${LINE}` }}
        >
          <Megaphone className="w-5 h-5 mx-auto mb-1.5" style={{ color: MUTED }} />
          <p className="text-sm" style={{ color: MUTED }}>No active announcement</p>
        </div>
      )}

      {/* ── Compose ── */}
      <div className="bg-white rounded-2xl p-5 space-y-4" style={{ border: `1px solid ${LINE}` }}>
        <h2 className="text-xs font-bold uppercase tracking-wider" style={{ color: MUTED }}>Compose</h2>

        {/* Quick templates */}
        <div className="flex flex-wrap gap-2">
          {TEMPLATES.map(t => (
            <button
              key={t.label}
              onClick={() => setDraft(t.text.slice(0, MAX_CHARS))}
              className="text-xs font-medium px-3 py-1.5 rounded-full transition-colors active:opacity-70"
              style={{ backgroundColor: '#F1F5F9', color: INK }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Textarea */}
        <div>
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value.slice(0, MAX_CHARS))}
            rows={4}
            placeholder="Type your announcement here…"
            className="w-full rounded-xl px-4 py-3 text-sm resize-none outline-none transition-all"
            style={{
              border: `1.5px solid ${LINE}`,
              color: INK,
              backgroundColor: '#F8FAFC',
            }}
            onFocus={e => { e.target.style.borderColor = G; e.target.style.boxShadow = '0 0 0 3px rgba(27,107,58,0.10)' }}
            onBlur={e =>  { e.target.style.borderColor = LINE; e.target.style.boxShadow = 'none' }}
          />
          <p className="text-right text-xs mt-1" style={{ color: remaining < 30 ? '#EF4444' : MUTED }}>
            {remaining} chars left
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={publish}
            disabled={busy || !draft.trim()}
            className="flex-1 py-3 rounded-xl text-sm font-semibold text-white transition-opacity active:opacity-80 disabled:opacity-40"
            style={{ backgroundColor: G }}
          >
            {busy ? 'Publishing…' : 'Publish'}
          </button>
          {draft && (
            <button
              onClick={() => setDraft('')}
              className="px-4 py-3 rounded-xl text-sm font-semibold transition-colors active:opacity-70"
              style={{ backgroundColor: '#F1F5F9', color: MUTED }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* ── Toast ── */}
      {toast && (
        <div
          className="fixed bottom-20 left-1/2 -translate-x-1/2 text-white px-4 py-2 rounded-xl shadow-lg text-sm font-semibold z-50 whitespace-nowrap"
          style={{ backgroundColor: INK }}
        >
          {toast}
        </div>
      )}
    </div>
  )
}
