/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        lux: {
          bg: 'var(--background)',
          panel: 'var(--panel)',
          border: 'var(--border)',
          text: 'var(--text)',
          muted: 'var(--muted)',
          accent: 'var(--accent)',
          hover: 'var(--panel-hover)',
        },
        brand: {
          emerald: '#10B981',  // Verde esmeralda (positivo/ingresos)
          rose: '#EF4444',     // Rojo carmesí (déficit/gastos)
          purple: '#8B5CF6',   // Violeta amatista (suscripciones)
          amber: '#F59E0B',    // Naranja ámbar (tarjetas)
          indigo: '#6366F1',   // Índigo (cuotas)
          cyan: '#06B6D4',     // Cian (servicios)
        }
      },
      fontFamily: {
        sans: ['Outfit', 'Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.3s ease-out forwards',
        'slide-up': 'slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        }
      }
    },
  },
  plugins: [],
}
