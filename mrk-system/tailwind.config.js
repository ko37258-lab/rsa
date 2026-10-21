/** 색은 모두 src/styles.css 의 CSS 변수(토큰)에서 온다 — 라이트/다크 전환은 토큰만 바꾼다 */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: v("bg"),
        surface: v("surface"),
        sunken: v("sunken"),
        line: v("line"),
        ink: v("ink"),
        ink2: v("ink2"),
        ink3: v("ink3"),
        navy: v("navy"),
        "navy-fg": v("navy-fg"),
        brass: v("brass"),
        good: v("good"),
        warn: v("warn"),
        bad: v("bad"),
        info: v("info"),
        violet: v("violet"),
      },
      fontFamily: {
        sans: ['"IBM Plex Sans KR"', '"Pretendard Variable"', "Pretendard", "-apple-system", "system-ui", "sans-serif"],
        display: ['"Bodoni Moda"', '"Noto Serif KR"', "Georgia", "serif"],
        mono: ['"IBM Plex Mono"', "ui-monospace", "SFMono-Regular", "monospace"],
      },
      borderRadius: { DEFAULT: "6px" },
    },
  },
  plugins: [],
};
