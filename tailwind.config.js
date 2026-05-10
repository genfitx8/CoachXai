/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // ─── Brand: deep emerald, tuned for AA contrast on dark surfaces ────
        primary: {
          50: '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
          800: '#065f46',
          900: '#064e3b',
          950: '#022c22',
        },
        // ─── Accent: muted violet for highlights / second brand voice ───────
        accent: {
          50: '#faf5ff',
          100: '#f3e8ff',
          200: '#e9d5ff',
          300: '#d8b4fe',
          400: '#c084fc',
          500: '#a855f7',
          600: '#9333ea',
          700: '#7e22ce',
          800: '#6b21a8',
          900: '#581c87',
          950: '#3b0764',
        },
        interactive: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
        // ─── Surface: warm neutral scale for backgrounds & elevation ────────
        // Tinted slightly green-warm so it harmonises with the emerald brand
        // instead of the cold pure-blue slate. Use these for app chrome,
        // cards, sheets, dividers, body text, etc.
        surface: {
          0:   '#ffffff',
          50:  '#f7f8f7',
          100: '#eceeed',
          200: '#d8dcda',
          300: '#b9bfbc',
          400: '#8a918e',
          500: '#5e6562',
          600: '#414844',
          700: '#2d3431',
          800: '#1c2220',
          900: '#101614',
          950: '#080c0a',
        },
        // ─── Semantic aliases — prefer these in app code ────────────────────
        // Components should reference role-based names so a future light-mode
        // pass can swap values without touching markup.
        bg: {
          base:    '#080c0a',  // page background (matches --app-bg-color)
          raised:  '#10160d',  // cards, sheets one level above page
          overlay: '#1c221d',  // modals, dropdowns, tooltips
          inset:   '#040605',  // pressed / inset wells
        },
        ink: {
          high:   '#f3f5f4',   // primary text, AA on bg.base
          medium: '#b9bfbc',   // secondary labels
          muted:  '#8a918e',   // captions, meta
          faint:  '#5e6562',   // disabled / placeholders
        },
        line: {
          subtle: 'rgba(255,255,255,0.06)',
          default:'rgba(255,255,255,0.10)',
          strong: 'rgba(255,255,255,0.18)',
        },
        gradient: {
          from: '#065f46',
          via: '#047857',
          to: '#064e3b',
        },
      },
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
        '100': '25rem',
        '112': '28rem',
        '128': '32rem',
      },
      borderRadius: {
        '4xl': '2rem',
        '5xl': '2.5rem',
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],
        // Display sizes for hero / section headings
        'display-sm': ['1.875rem', { lineHeight: '2.25rem', letterSpacing: '-0.015em' }],
        'display':    ['2.25rem',  { lineHeight: '2.5rem',  letterSpacing: '-0.02em'  }],
        'display-lg': ['3rem',     { lineHeight: '3.25rem', letterSpacing: '-0.025em' }],
      },
      boxShadow: {
        // Premium elevation scale: warm dark tints, no harsh black
        'soft':    '0 2px 15px -3px rgba(0, 0, 0, 0.07), 0 10px 20px -2px rgba(0, 0, 0, 0.04)',
        'soft-lg': '0 10px 40px -15px rgba(0, 0, 0, 0.1),  0 20px 25px -5px rgba(0, 0, 0, 0.04)',
        'elev-1':  '0 1px 2px rgba(0,0,0,0.30), 0 1px 1px rgba(0,0,0,0.18)',
        'elev-2':  '0 4px 12px -2px rgba(0,0,0,0.35), 0 2px 4px -1px rgba(0,0,0,0.20)',
        'elev-3':  '0 12px 32px -8px rgba(0,0,0,0.45), 0 6px 12px -4px rgba(0,0,0,0.25)',
        'elev-4':  '0 24px 56px -16px rgba(0,0,0,0.55), 0 12px 24px -8px rgba(0,0,0,0.30)',
        'glow':    '0 0 20px rgba(16, 185, 129, 0.30)',
        'glow-lg': '0 0 30px rgba(16, 185, 129, 0.40)',
        'ring-primary': '0 0 0 3px rgba(16, 185, 129, 0.35)',
      },
      animation: {
        'slide-in-up': 'slideInUp 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-in-down': 'slideInDown 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-in-left': 'slideInLeft 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-in-right': 'slideInRight 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
        'scale-in': 'scaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        'shimmer': 'shimmer 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'float': 'float 3s ease-in-out infinite',
        'bounce-soft': 'bounceSoft 2s ease-in-out infinite',
        'pulse-soft': 'pulseSoft 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        slideInUp: {
          '0%': {
            transform: 'translateY(20px)',
            opacity: '0'
          },
          '100%': {
            transform: 'translateY(0)',
            opacity: '1'
          },
        },
        slideInDown: {
          '0%': {
            transform: 'translateY(-20px)',
            opacity: '0'
          },
          '100%': {
            transform: 'translateY(0)',
            opacity: '1'
          },
        },
        slideInLeft: {
          '0%': {
            transform: 'translateX(-20px)',
            opacity: '0'
          },
          '100%': {
            transform: 'translateX(0)',
            opacity: '1'
          },
        },
        slideInRight: {
          '0%': {
            transform: 'translateX(20px)',
            opacity: '0'
          },
          '100%': {
            transform: 'translateX(0)',
            opacity: '1'
          },
        },
        scaleIn: {
          '0%': {
            transform: 'scale(0.95)',
            opacity: '0'
          },
          '100%': {
            transform: 'scale(1)',
            opacity: '1'
          },
        },
        shimmer: {
          '0%': {
            backgroundPosition: '-200% 0'
          },
          '100%': {
            backgroundPosition: '200% 0'
          },
        },
        float: {
          '0%, 100%': {
            transform: 'translateY(0px)'
          },
          '50%': {
            transform: 'translateY(-10px)'
          },
        },
        bounceSoft: {
          '0%, 100%': {
            transform: 'translateY(-3%)'
          },
          '50%': {
            transform: 'translateY(3%)'
          },
        },
        pulseSoft: {
          '0%, 100%': {
            opacity: '1'
          },
          '50%': {
            opacity: '0.8'
          },
        },
      },
    },
  },
  plugins: [],
};
