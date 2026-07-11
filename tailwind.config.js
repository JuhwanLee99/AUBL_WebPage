/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        aubl: {
          blue: '#0e4082', // AUBL 공식 로고 블루
          orange: '#f27d26', // AUBL 공식 로고 오렌지
        }
      },
      fontFamily: {
        sans: ['Pretendard', 'Inter', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
