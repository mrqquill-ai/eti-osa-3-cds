/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        // DM Sans first so the whole app matches the auth pages
        sans: ['DM Sans', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif']
      },
      colors: {
        // Override Tailwind's teal-leaning emerald with the NYSC brand green (#1B6B3A)
        // so every emerald-* class in Dashboard.jsx automatically uses the correct shade
        emerald: {
          50:  '#E8F5EE',
          100: '#C5E8D3',
          200: '#9DD5B5',
          300: '#6DBF92',
          400: '#42A870',
          500: '#278F52',
          600: '#1F7A43',
          700: '#1B6B3A',   // ← NYSC brand green (was Tailwind's #047857)
          800: '#155530',
          900: '#0E3D22',
          950: '#082514',
        }
      }
    }
  },
  plugins: []
}
