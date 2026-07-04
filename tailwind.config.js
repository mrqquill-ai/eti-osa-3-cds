/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['DM Sans', 'Inter', 'system-ui', '-apple-system', 'sans-serif']
      },
      colors: {
        // ── Semantic tokens (values live in src/index.css :root) ──
        brand:            'var(--brand-green)',
        'brand-tint':     'var(--brand-green-tint)',
        gold:             'var(--accent-gold)',
        'gold-tint':      'var(--accent-gold-tint)',
        'status-waiting': 'var(--status-waiting)',
        'status-served':  'var(--status-served)',
        'status-danger':  'var(--status-danger)',
        surface:          'var(--surface)',
        'surface-raised': 'var(--surface-raised)',
        'text-primary':   'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        line:             'var(--line)',
        // ── Legacy aliases (non-dashboard pages) ─────────────────
        live:        '#F59B0A',   // operational state only
        cream:       '#F9F6F0',   // page background
        destructive: '#C0392B',   // destructive actions only
        muted:       '#8C8880',   // inactive, disabled, secondary
        ink:         '#1A1A1A',   // primary text
        // ── Override Tailwind emerald with brand green ──────────
        emerald: {
          50:  '#E8F5EE',
          100: '#C5E8D3',
          200: '#9DD5B5',
          300: '#6DBF92',
          400: '#42A870',
          500: '#278F52',
          600: '#1F7A43',
          700: '#1B6B3A',   // ← NYSC brand green
          800: '#155530',
          900: '#0E3D22',
          950: '#082514',
        }
      }
    }
  },
  plugins: []
}
