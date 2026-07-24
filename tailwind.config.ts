import type { Config } from "tailwindcss";

// The palette carries the thesis: --signal appears only on the Point side.
// Never colour alone — every state distinction also carries shape, icon, or text.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#14181F",
        "ink-soft": "#4A5462",
        paper: "#FBFBF9",
        card: "#FFFFFF",
        edge: "#DDE1E6",
        signal: "#1B4D8F",
        "signal-bg": "#EAF1FA",
        stale: "#6B7280",
      },
      fontFamily: {
        sans: ["var(--font-atkinson)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
