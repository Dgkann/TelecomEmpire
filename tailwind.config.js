/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          900: '#0b1218',
          800: '#111b23',
          700: '#18242d',
          600: '#22313b',
          500: '#30414c',
          400: '#4b5d68',
        },
        neon: {
          cyan: '#56aaa2',
          blue: '#7199bd',
          lime: '#76ad84',
          amber: '#c49a51',
          orange: '#bd8251',
          red: '#c9686f',
          violet: '#9183ad',
        },
      },
      fontFamily: {
        display: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        sans: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        panel: '0 8px 22px -16px rgba(0,0,0,0.72)',
        glow: '0 0 0 1px rgba(86,170,162,0.18)',
      },
    },
  },
  plugins: [],
};
