/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          900: '#080b12',
          800: '#0d1119',
          700: '#141a25',
          600: '#1c2431',
          500: '#26303f',
          400: '#3a4658',
        },
        neon: {
          cyan: '#3ee6d6',
          blue: '#4d8dff',
          lime: '#7ee787',
          amber: '#ffc857',
          orange: '#ff9f43',
          red: '#ff5c68',
          violet: '#a78bfa',
        },
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        panel: '0 20px 50px -20px rgba(0,0,0,0.85)',
        glow: '0 0 24px -4px rgba(62,230,214,0.55)',
      },
    },
  },
  plugins: [],
};
