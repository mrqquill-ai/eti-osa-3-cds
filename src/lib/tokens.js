// Semantic design tokens for inline styles. Values live in src/index.css (:root).
// Components must consume these instead of raw hex values.
//
// Scales (Tailwind classes, 4px base):
//   spacing: p-1 (4) p-2 (8) p-3 (12) p-4 (16) p-5 (20) p-6 (24)
//   radius:  rounded-lg = sm (8), rounded-xl = md (12), rounded-2xl = lg (16)

export const T = {
  brand:        'var(--brand-green)',
  brandTint:    'var(--brand-green-tint)',
  gold:         'var(--accent-gold)',
  goldTint:     'var(--accent-gold-tint)',
  waiting:      'var(--status-waiting)',
  waitingTint:  'var(--status-waiting-tint)',
  served:       'var(--status-served)',
  servedTint:   'var(--status-served-tint)',
  danger:       'var(--status-danger)',
  dangerTint:   'var(--status-danger-tint)',
  surface:      'var(--surface)',
  raised:       'var(--surface-raised)',
  sunken:       'var(--surface-sunken)',
  textPrimary:  'var(--text-primary)',
  textSecondary:'var(--text-secondary)',
  onBrand:      'var(--text-on-brand)',
  line:         'var(--line)',
  focusRing:    'var(--focus-ring)',
}
