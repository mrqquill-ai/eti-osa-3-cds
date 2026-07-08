import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import { supabase } from '../lib/supabase.js'

const G    = '#1B6B3A'
const MUTED = '#8C8880'
const INK   = '#1A1A1A'
const LINE  = '#E0DDD6'
const CREAM = '#F9F6F0'

function formatDateTime(ts) {
  if (!ts) return 'Not yet'
  return new Date(ts).toLocaleString('en-NG', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  })
}

export default function Members() {
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

  const [rows,        setRows]        = useState([])
  const [loading,     setLoading]     = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedId,  setExpandedId]  = useState(null)

  /* ── Initial load ── */
  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data } = await supabase
        .from('registrations')
        .select('*')
        .order('queue_number', { ascending: true })
        .limit(2000)
      if (data) setRows(data)
      setLoading(false)
    }
    load()

    /* Live updates */
    const ch = supabase
      .channel('members-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'registrations' }, payload => {
        setRows(prev => {
          if (payload.eventType === 'INSERT') {
            if (prev.some(r => r.id === payload.new.id)) return prev
            return [...prev, payload.new].sort((a, b) => a.queue_number - b.queue_number)
          }
          if (payload.eventType === 'UPDATE') {
            return prev.map(r => r.id === payload.new.id ? payload.new : r)
          }
          if (payload.eventType === 'DELETE') {
            return prev.filter(r => r.id !== payload.old.id)
          }
          return prev
        })
      })
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [])

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    if (!q) return rows
    return rows.filter(r =>
      r.full_name.toLowerCase().includes(q) ||
      r.state_code.toLowerCase().includes(q)
    )
  }, [rows, searchQuery])

  /* ── Render ── */
  return (
    <div className="max-w-2xl mx-auto px-4 py-4">

      <h1 className="text-xl font-bold mb-4" style={{ color: INK }}>Members</h1>

      {/* Search bar */}
      <div className="relative mb-4">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: MUTED }} />
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search by name or state code…"
          className="w-full pl-10 pr-4 py-3 rounded-xl bg-white text-sm outline-none transition-all"
          style={{ border: `1px solid ${LINE}`, color: INK }}
          onFocus={e => {
            e.target.style.borderColor = G
            e.target.style.boxShadow = '0 0 0 3px rgba(27,107,58,0.1)'
          }}
          onBlur={e => {
            e.target.style.borderColor = LINE
            e.target.style.boxShadow = 'none'
          }}
        />
      </div>

      {/* Loading */}
      {loading && (
        <div className="py-16 flex items-center justify-center">
          <svg className="w-6 h-6 animate-spin" style={{ color: G }} fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
          </svg>
        </div>
      )}

      {/* List */}
      {!loading && (
        <>
          <div className="text-xs font-medium mb-2" style={{ color: MUTED }}>
            {searchQuery
              ? `${filtered.length} of ${rows.length} members`
              : `${rows.length} members total`}
          </div>

          <div className="bg-white rounded-xl overflow-hidden" style={{ border: `1px solid ${LINE}` }}>
            {filtered.length === 0 && (
              <div className="py-12 text-center text-sm" style={{ color: MUTED }}>
                {searchQuery ? 'No members found.' : 'No registrations yet.'}
              </div>
            )}

            <div className="divide-y" style={{ borderColor: LINE }}>
              {filtered.map(r => (
                <div key={r.id}>
                  {/* Row */}
                  <div
                    className="flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors active:opacity-70"
                    style={{ backgroundColor: expandedId === r.id ? CREAM : 'white' }}
                    onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                  >
                    {/* Queue number badge */}
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0"
                      style={{ backgroundColor: 'rgba(27,107,58,0.08)', color: G }}
                    >
                      {r.queue_number}
                    </div>

                    {/* Name + state code */}
                    <div className="flex-1 min-w-0">
                      <div
                        className={`text-sm font-semibold truncate ${r.voided ? 'line-through opacity-50' : ''}`}
                        style={{ color: INK }}
                      >
                        {r.full_name}
                      </div>
                      <div className="text-xs font-mono mt-0.5" style={{ color: MUTED }}>
                        {r.state_code}
                      </div>
                    </div>

                    {/* Wave badge */}
                    <span
                      className="text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: 'rgba(27,107,58,0.08)', color: G }}
                    >
                      W{r.batch_number}
                    </span>
                  </div>

                  {/* Expanded detail panel */}
                  {expandedId === r.id && (
                    <div
                      className="px-4 py-4"
                      style={{
                        backgroundColor: CREAM,
                        borderTop: `1px solid ${LINE}`,
                      }}
                    >
                      <div className="grid grid-cols-2 gap-4 text-xs">
                        <div>
                          <span className="font-semibold uppercase tracking-wide" style={{ color: MUTED }}>
                            State Code
                          </span>
                          <div className="font-mono font-bold mt-1" style={{ color: INK }}>
                            {r.state_code}
                          </div>
                        </div>
                        <div>
                          <span className="font-semibold uppercase tracking-wide" style={{ color: MUTED }}>
                            Wave
                          </span>
                          <div className="font-bold mt-1" style={{ color: INK }}>
                            Wave {r.batch_number}
                          </div>
                        </div>
                        <div>
                          <span className="font-semibold uppercase tracking-wide" style={{ color: MUTED }}>
                            Registered
                          </span>
                          <div className="font-medium mt-1" style={{ color: INK }}>
                            {formatDateTime(r.registered_at)}
                          </div>
                        </div>
                        <div>
                          <span className="font-semibold uppercase tracking-wide" style={{ color: MUTED }}>
                            Status
                          </span>
                          <div
                            className="font-semibold mt-1"
                            style={{
                              color: r.voided ? '#C0392B'
                                : r.served_at ? G
                                : MUTED
                            }}
                          >
                            {r.voided ? 'Voided'
                              : r.served_at ? 'Served'
                              : 'Waiting'}
                          </div>
                        </div>
                        {r.served_at && (
                          <div className="col-span-2">
                            <span className="font-semibold uppercase tracking-wide" style={{ color: MUTED }}>
                              Served at
                            </span>
                            <div className="font-medium mt-1" style={{ color: INK }}>
                              {formatDateTime(r.served_at)}
                            </div>
                          </div>
                        )}
                        {r.voided && (
                          <div className="col-span-2">
                            <span
                              className="inline-block text-xs font-bold px-2 py-0.5 rounded-full"
                              style={{ backgroundColor: 'rgba(192,57,43,0.08)', color: '#C0392B' }}
                            >
                              Voided. Contact coordinator
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
