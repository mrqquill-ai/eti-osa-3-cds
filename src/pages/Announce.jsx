import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Megaphone, X, Clock, RotateCcw, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase.js'

const G     = '#1B6B3A'
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

function fmtTime(iso) {
  const d = new Date(iso)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function timeSince(iso) {
  const secs = Math.floor((Date.now() - new Date(iso)) / 1000)
  if (secs < 60)  return 'Just now'
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  return `${Math.floor(secs / 3600)}h ago`
}

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

  const [current,        setCurrent]        = useState('')
  const [draft,          setDraft]          = useState('')
  const [busy,           setBusy]           = useState(false)
  const [toast,          setToast]          = useState('')
  const [history,        setHistory]        = useState([])
  const [historyLoading, setHistoryLoading] = useState(true)

  /* ── Load history from DB (persists across refreshes and exec handoffs) ── */
  useEffect(() => {
    supabase
      .from('announcement_history')
      .select('id, text, created_at')
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => {
        if (data) setHistory(data)
        setHistoryLoading(false)
      })
  }, [])

  async function saveToHistory(text) {
    const { data } = await supabase
      .from('announcement_history')
      .insert({ text })
      .select('id, text, created_at')
      .single()
    if (data) setHistory(prev => [data, ...prev].slice(0, 50))
  }

  async function clearHistory() {
    await supabase.from('announcement_history').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    setHistory([])
  }

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
    const text = draft.trim()
    const { error } = await supabase
      .from('session_settings')
      .update({ announcement: text })
      .eq('id', 1)
    setBusy(false)
    if (error) { flash('Failed to publish: ' + error.message); return }
    await saveToHistory(text)
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
    <div className="max-w-lg mx-auto px-4 py-6 lg:max-w-5xl lg:px-8 lg:py-8">

      {/* Header */}
      <div className="mb-5">
        <h1 className="text-xl font-bold" style={{ color: INK }}>Announcements</h1>
        <p className="text-sm mt-0.5" style={{ color: MUTED }}>
          Broadcast a message to all corps members' status screens
        </p>
      </div>

      {/* ── Desktop: 3-column / mobile: single-column ── */}
      <div className="lg:grid lg:grid-cols-[1fr_1fr_1fr] lg:gap-6 space-y-5 lg:space-y-0">

        {/* ── COL 1: Compose ── */}
        <div className="bg-white rounded-2xl p-5 space-y-4" style={{ border: `1px solid ${LINE}` }}>
          <h2 className="text-xs font-bold uppercase tracking-wider" style={{ color: MUTED }}>Compose</h2>

          {/* Quick templates */}
          <div className="flex flex-wrap gap-2">
            {TEMPLATES.map(t => (
              <button
                key={t.label}
                onClick={() => setDraft(t.text.slice(0, MAX_CHARS))}
                className="text-xs font-medium px-3 py-1.5 rounded-full transition-colors active:opacity-70 hover:bg-slate-200"
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
              rows={6}
              placeholder="Type your announcement here…"
              className="w-full rounded-xl px-4 py-3 text-sm resize-none outline-none transition-all"
              style={{ border: `1.5px solid ${LINE}`, color: INK, backgroundColor: '#F8FAFC' }}
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

        {/* ── COL 2: Live preview ── */}
        <div className="bg-white rounded-2xl p-5 space-y-4" style={{ border: `1px solid ${LINE}` }}>
          <h2 className="text-xs font-bold uppercase tracking-wider" style={{ color: MUTED }}>
            Live — what corps members see
          </h2>

          {/* Current live announcement */}
          {current ? (
            <div className="rounded-xl p-3"
              style={{ backgroundColor: 'rgba(245,155,10,0.08)', border: `1px solid rgba(245,155,10,0.3)` }}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <Megaphone className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: AMBER }} />
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: AMBER }}>Live now</p>
                    <p className="text-sm leading-snug" style={{ color: INK }}>{current}</p>
                  </div>
                </div>
                <button
                  onClick={clearAnnouncement}
                  disabled={busy}
                  className="flex-shrink-0 p-1 rounded-lg transition-colors active:opacity-70 disabled:opacity-40"
                  style={{ color: MUTED }}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-xl p-5 text-center"
              style={{ backgroundColor: '#F8FAFC', border: `1px dashed ${LINE}` }}>
              <Megaphone className="w-6 h-6 mx-auto mb-2" style={{ color: LINE }} />
              <p className="text-sm font-medium" style={{ color: MUTED }}>No active announcement</p>
              <p className="text-xs mt-1" style={{ color: MUTED }}>Corps members see a blank banner</p>
            </div>
          )}

          {/* Draft preview */}
          {draft.trim() && (
            <div>
              <p className="text-xs font-semibold mb-2" style={{ color: MUTED }}>Draft preview:</p>
              <div className="rounded-xl p-3"
                style={{ backgroundColor: 'rgba(245,155,10,0.04)', border: `1px dashed rgba(245,155,10,0.4)` }}>
                <div className="flex items-start gap-2.5">
                  <Megaphone className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: AMBER }} />
                  <p className="text-sm leading-snug" style={{ color: INK }}>{draft}</p>
                </div>
              </div>
            </div>
          )}

          {/* What the status page looks like */}
          <div>
            <p className="text-xs font-semibold mb-2" style={{ color: MUTED }}>Status page mockup:</p>
            <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${LINE}` }}>
              {/* fake status-page header */}
              <div className="px-3 py-2 text-xs font-bold text-white text-center" style={{ backgroundColor: G }}>
                Eti-Osa 3 CDS · Queue Status
              </div>
              {/* fake banner */}
              {(current || draft.trim()) ? (
                <div className="px-3 py-2 flex items-center gap-2"
                  style={{ backgroundColor: 'rgba(245,155,10,0.12)', borderBottom: `1px solid rgba(245,155,10,0.2)` }}>
                  <Megaphone className="w-3 h-3 flex-shrink-0" style={{ color: AMBER }} />
                  <p className="text-xs leading-snug line-clamp-2" style={{ color: '#92400E' }}>
                    {draft.trim() || current}
                  </p>
                </div>
              ) : (
                <div className="px-3 py-2 text-center" style={{ borderBottom: `1px solid ${LINE}` }}>
                  <p className="text-xs" style={{ color: MUTED }}>No announcement</p>
                </div>
              )}
              {/* fake queue card */}
              <div className="px-3 py-3 text-center">
                <p className="text-xs" style={{ color: MUTED }}>Now serving</p>
                <p className="text-3xl font-extrabold" style={{ color: INK }}>12</p>
                <p className="text-xs mt-0.5" style={{ color: MUTED }}>Your number: 18 · Wave 2</p>
              </div>
            </div>
          </div>
        </div>

        {/* ── COL 3 / mobile bottom: History ── */}
        <div className="bg-white rounded-2xl p-5" style={{ border: `1px solid ${LINE}` }}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider" style={{ color: MUTED }}>Session history</h2>
              <p className="text-xs mt-0.5" style={{ color: MUTED }}>Announcements sent this session</p>
            </div>
            {history.length > 0 && (
              <button
                onClick={clearHistory}
                className="p-1.5 rounded-lg transition-colors hover:bg-slate-100 active:opacity-70"
                title="Clear history"
                style={{ color: MUTED }}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {historyLoading ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Clock className="w-6 h-6 mb-2 animate-spin" style={{ color: LINE }} />
              <p className="text-xs" style={{ color: MUTED }}>Loading history…</p>
            </div>
          ) : history.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Clock className="w-8 h-8 mb-3" style={{ color: LINE }} />
              <p className="text-sm font-medium" style={{ color: MUTED }}>No history yet</p>
              <p className="text-xs mt-1" style={{ color: MUTED }}>Published announcements appear here</p>
            </div>
          ) : (
            <div className="space-y-2 overflow-y-auto" style={{ maxHeight: '420px' }}>
              {history.map((h) => (
                <div key={h.id} className="rounded-xl p-3 group relative"
                  style={{ backgroundColor: '#F8FAFC', border: `1px solid ${LINE}` }}>
                  <div className="flex items-start gap-2 pr-8">
                    <Megaphone className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: AMBER }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs leading-snug" style={{ color: INK }}>{h.text}</p>
                      <p className="text-[10px] mt-1.5 flex items-center gap-1" style={{ color: MUTED }}>
                        <Clock className="w-2.5 h-2.5 inline" />
                        {fmtTime(h.created_at)} · {timeSince(h.created_at)}
                      </p>
                    </div>
                  </div>
                  {/* Re-use button */}
                  <button
                    onClick={() => setDraft(h.text)}
                    title="Re-use this announcement"
                    className="absolute top-2.5 right-2.5 p-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity active:opacity-70"
                    style={{ color: G, backgroundColor: 'rgba(27,107,58,0.08)' }}
                  >
                    <RotateCcw className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
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
