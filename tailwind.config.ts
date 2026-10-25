import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: "#101C30", 2: "#182B43", 3: "#22385A" },
        ivory: { DEFAULT: "#F8F7F3", 2: "#F1EFE8", 3: "#E8E5DC" },
        gold: { DEFAULT: "#C2A675", soft: "#E9DFCB", deep: "#6E5A33" },
        // #64748B (spec Slate Gray) is 4.43:1 on ivory; text uses a slightly deeper tone to meet WCAG AA 4.5:1
        slate: { DEFAULT: "#566275", brand: "#64748B" },
        ink: { DEFAULT: "#16202F", 2: "#3A4558", 3: "#5B6678" },
        line: { DEFAULT: "#E2DED3", strong: "#CFC9BA" },
        cat: { personal: "#3D5A80", cyber: "#8E3B46", consumer: "#4F7A64", other: "#64748B" },
        st: {
          draft: "#64748B", review: "#2F5D8A", approved: "#2E7D6B", published: "#101C30",
          revision: "#8F5A0E", suspended: "#A23B3B", archived: "#94A3B8",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "var(--font-num)", "system-ui", "sans-serif"],
        serif: ["var(--font-serif)", "serif"],
        num: ["var(--font-num)", "var(--font-sans)", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      fontSize: { "2xs": ["0.6875rem", { lineHeight: "1rem" }] },
      boxShadow: {
        hair: "0 0 0 1px rgba(16,28,48,0.06), 0 1px 2px rgba(16,28,48,0.04)",
        lift: "0 1px 0 rgba(16,28,48,0.04), 0 12px 32px -12px rgba(16,28,48,0.18)",
        frame: "0 30px 80px -30px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.06)",
      },
      keyframes: {
        "flash-gold": { "0%": { backgroundColor: "rgba(194,166,117,0.35)" }, "100%": { backgroundColor: "transparent" } },
        scan: { "0%": { transform: "translateX(-100%)" }, "100%": { transform: "translateX(100%)" } },
        grow: { "0%": { transform: "scaleY(0)" }, "100%": { transform: "scaleY(1)" } },
      },
      animation: { "flash-gold": "flash-gold 2.4s ease-out", scan: "scan 1.6s linear infinite", grow: "grow 0.6s cubic-bezier(0.2,0.8,0.2,1)" },
    },
  },
  plugins: [animate],
} satisfies Config;
