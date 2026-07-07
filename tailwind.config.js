/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // warm cream surfaces
        cream: {
          50:  '#ecf6f1',
          100: '#ddf0e9',
          200: '#c9e7dd',
          300: '#a4d4c6',
          400: '#80c0ae'
        },
        // executive brick — refined for higher contrast
        brand: {
          50:  '#e9f7f3',
          100: '#c8ece3',
          200: '#93dcc9',
          300: '#57c4ab',
          400: '#23a88e',
          500: '#0f8f77',
          600: '#0c7663',
          700: '#0a604f',
          800: '#0a4d40',
          900: '#0b3e34'
        },
        ink: {
          900: '#0c1a17',
          800: '#12241f',
          700: '#1e3a33',
          600: '#3c5a52',
          500: '#5f7d74'
        },
        accent: {
          blue:  '#0891b2',
          green: '#10b981',
          amber: '#d28a1d',
          red:   '#c0392b',
          gold:  '#c8924a'
        }
      },
      fontFamily: {
        sans:    ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['"Playfair Display"', 'Georgia', 'serif']
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #0f8f77 0%, #0a604f 100%)',
        'cream-gradient': 'linear-gradient(180deg, #f4fbf9 0%, #e8f6f1 100%)',
        'aurora':        'radial-gradient(60% 60% at 50% 0%, rgba(45,212,191,0.18) 0%, rgba(244,251,249,0) 70%)',
        'noise':         "url(\"data:image/svg+xml;utf8,<svg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/><feColorMatrix values='0 0 0 0 0.08 0 0 0 0 0.58 0 0 0 0 0.52 0 0 0 0.05 0'/></filter><rect width='200' height='200' filter='url(%23n)'/></svg>\")"
      },
      boxShadow: {
        soft:  '0 1px 2px rgba(6,40,34,0.04), 0 8px 24px -12px rgba(6,40,34,0.10)',
        lift:  '0 2px 4px rgba(6,40,34,0.05), 0 18px 38px -16px rgba(6,40,34,0.18)',
        glow:  '0 0 0 1px rgba(12,118,99,0.18), 0 14px 36px -12px rgba(12,118,99,0.32)',
        ring:  '0 0 0 1px rgba(12,118,99,0.15)',
        inset: 'inset 0 1px 0 rgba(255,255,255,0.6)'
      },
      animation: {
        'fade-in':        'fadeIn 220ms ease-out',
        'fade-up':        'fadeUp 360ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'fade-up-slow':   'fadeUp 520ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'slide-in':       'slideIn 280ms cubic-bezier(0.22, 1, 0.36, 1)',
        'scale-in':       'scaleIn 260ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'shimmer':        'shimmer 1.6s linear infinite',
        'pulse-soft':     'pulseSoft 2.4s ease-in-out infinite',
        'breathe':        'breathe 3.4s ease-in-out infinite',
        'spin-slow':      'spin 3s linear infinite',
        'progress-indet': 'progressIndet 1.6s cubic-bezier(0.65, 0, 0.35, 1) infinite'
      },
      keyframes: {
        fadeIn:   { '0%': { opacity: 0 }, '100%': { opacity: 1 } },
        fadeUp:   {
          '0%':   { opacity: 0, transform: 'translateY(12px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' }
        },
        slideIn:  {
          '0%':   { transform: 'translateX(24px)', opacity: 0 },
          '100%': { transform: 'translateX(0)',    opacity: 1 }
        },
        scaleIn:  {
          '0%':   { opacity: 0, transform: 'scale(0.96)' },
          '100%': { opacity: 1, transform: 'scale(1)' }
        },
        shimmer:  {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' }
        },
        pulseSoft: {
          '0%, 100%': { opacity: 1 },
          '50%':      { opacity: 0.55 }
        },
        breathe: {
          '0%, 100%': { transform: 'scale(1)' },
          '50%':      { transform: 'scale(1.04)' }
        },
        progressIndet: {
          '0%':   { transform: 'translateX(-100%) scaleX(0.6)' },
          '60%':  { transform: 'translateX(40%)   scaleX(0.9)' },
          '100%': { transform: 'translateX(120%)  scaleX(0.6)' }
        }
      },
      transitionTimingFunction: {
        snap:    'cubic-bezier(0.22, 1, 0.36, 1)',
        spring:  'cubic-bezier(0.34, 1.56, 0.64, 1)'
      }
    }
  },
  plugins: []
};
