import type { Config } from 'tailwindcss';

// Values mirror src/styles/tokens.css.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"Geist Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      colors: {
        primary: { DEFAULT: '#4F46E5', 700: '#4338CA' },
        violet: { DEFAULT: '#7C3AED' },
        ink: { DEFAULT: '#0B1220', secondary: '#667085', label: '#344054', muted: '#98A2B3' },
        line: { DEFAULT: '#D0D5DD', soft: '#EAECF0' },
        app: '#F6F7FB',
        surface: '#FFFFFF',
        danger: { DEFAULT: '#D92D20', border: '#FDA29B', bg: '#FEF3F2' },
        warning: { DEFAULT: '#93370D', border: '#FEDF89', bg: '#FFFAEB' },
        info: { DEFAULT: '#3730A3', border: '#E0E3FF', bg: '#F5F6FF' },
        success: { DEFAULT: '#12B76A' },
        night: '#0B1020',
      },
      backgroundImage: {
        'gradient-btn': 'linear-gradient(135deg, #4F46E5 0%, #6D28D9 100%)',
      },
      borderRadius: {
        field: '10px',
        card: '16px',
        panel: '24px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(16,24,40,.05), 0 8px 24px -6px rgba(16,24,40,.06)',
        btn: '0 1px 2px rgba(16,24,40,.05), 0 6px 16px -4px rgba(79,70,229,.45)',
      },
    },
  },
  plugins: [],
} satisfies Config;
