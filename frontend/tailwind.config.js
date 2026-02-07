/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#3182F6', // 토스 블루
        'toss-gray': '#F5F5F7', // 토스 배경 회색
        'toss-gray-light': '#FAFAFA',
        'toss-gray-dark': '#1C1C1E',
      },
      borderRadius: {
        'toss': '20px', // 토스 카드 라운드
        'toss-lg': '24px',
        'toss-button': '16px',
        'pill': '9999px',
      },
      boxShadow: {
        'toss': '0 1px 2px rgba(0, 0, 0, 0.02)',
        'toss-sm': '0 1px 3px rgba(0, 0, 0, 0.04)',
      },
      spacing: {
        '18': '4.5rem',
        '22': '5.5rem',
      }
    },
  },
  plugins: [],
}
