/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: '#0e0f11',
        panel: '#16181c',
        border: '#2a2d35',
        accent: '#e8c84a',
        muted: '#6b7080',
        success: '#4ecb71',
        warn: '#e87c3a',
        danger: '#e84a4a',
      },
      fontFamily: {
        mono: ['"Courier New"', 'monospace'],
      },
    },
  },
  plugins: [],
};
