/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Tajawal"', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#EBF4F1',
          100: '#D2E7E0',
          200: '#A6CFC1',
          300: '#79B7A2',
          400: '#4D9F83',
          500: '#2F8267',
          600: '#146C5E',
          700: '#0F5A4E',
          800: '#0D4F44',
          900: '#083A33',
        },
        ink: {
          50: '#F4F8F7',
          100: '#E7F0EE',
          200: '#D5E3E0',
          300: '#B8CCC7',
          // Shared readable petrol hierarchy: metadata, secondary copy, and main text.
          // ink-300 remains deliberately softer for disabled/decorative elements.
          400: '#526B68',
          500: '#425B58',
          600: '#304744',
          700: '#233936',
          800: '#172C29',
          900: '#0F201E',
        },
        clinical: {
          50: '#F4FAF8',
          100: '#E7F3EF',
          200: '#CDE7DF',
          600: '#47716A',
        },
        amber: {
          50: '#FBF3EA',
          100: '#F4E2CB',
          500: '#B8763A',
          600: '#9C6230',
        },
      },
      boxShadow: {
        card: '0 1px 2px 0 rgba(16, 30, 29, 0.06), 0 1px 3px 0 rgba(16, 30, 29, 0.08)',
      },
      borderRadius: {
        xl2: '0.875rem',
      },
    },
  },
  plugins: [],
}
