/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}', './app/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Paleta principal MacroVision
        primary: {
          DEFAULT: '#10b981', // Verde esmeralda (acción principal)
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
        // Fondo dark premium
        background: {
          DEFAULT: '#000000',
          card: '#111111',
          elevated: '#1a1a1a',
          border: '#2a2a2a',
        },
        // Macros
        protein: '#3b82f6',      // Azul
        carbs: '#f59e0b',        // Ámbar
        fat: '#f97316',          // Naranja
        fiber: '#8b5cf6',        // Púrpura
        calories: '#10b981',     // Verde (igual que primary)

        // Estados
        success: '#10b981',
        warning: '#f59e0b',
        error: '#ef4444',
        info: '#3b82f6',

        // Texto
        text: {
          primary: '#ffffff',
          secondary: '#a1a1aa',
          muted: '#52525b',
          inverse: '#000000',
        },
      },
      fontFamily: {
        sans: ['SF Pro Display', 'System'],
        mono: ['SF Mono', 'Menlo'],
      },
      borderRadius: {
        '2xl': '16px',
        '3xl': '24px',
        '4xl': '32px',
      },
      spacing: {
        safe: 'env(safe-area-inset-bottom)',
      },
    },
  },
  plugins: [],
};
