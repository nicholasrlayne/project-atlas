/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0B0D10',
        cell: '#14181D',
        'cell-2': '#1B2027',
        border: {
          DEFAULT: 'rgba(255,255,255,0.08)',
          strong: 'rgba(255,255,255,0.14)',
        },
        chalk: '#F5F6F4',
        mist: {
          DEFAULT: '#9AA1A9',
          dim: '#666C74',
        },
        amber: {
          DEFAULT: '#E8A33D',
          dim: '#3A2A12',
          ink: '#26190A',
        },
        dusk: {
          DEFAULT: '#56697D',
          dim: '#1B232C',
          ink: '#0E1820',
        },
        shadow: '#3A4450',
        coral: '#E2665B',
      },
      fontFamily: {
        head: ['Manrope', 'sans-serif'],
        sans: ['Inter', 'sans-serif'],
        mono: ['IBM Plex Mono', 'monospace'],
      },
    },
  },
  plugins: [],
};
