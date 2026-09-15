/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        sans: ['"Manrope"', 'system-ui', 'sans-serif'],
      },
      colors: {
        bg: '#F7F5FF',
        surface: '#FFFFFF',
        ink: '#181A2A',
        muted: '#5B5F7A',
        faint: '#9498B3',
        line: '#E4E1F5',
        lineSoft: '#EEECFA',
        wash: '#F1EFFC',

        side: '#181433',
        side2: '#241E4E',
        sideLine: '#332A63',
        sideText: '#C9C4E8',
        sideMuted: '#8A82B8',

        brand: '#5B4EE0',
        brandTint: '#E7E4FB',
        coral: '#FF6B57',
        coralTint: '#FFE7E1',
        amber: '#C98A1D',
        amberTint: '#FBEFDA',
        rose: '#D1477A',
        roseTint: '#FBE4ED',
        blue: '#2F6FE0',
        blueTint: '#E4EDFD',
        teal: '#0E9488',
        tealTint: '#DEF5F1',
        green: '#3F9142',
        greenTint: '#E3F5E1',
      },
    },
  },
  plugins: [],
};
