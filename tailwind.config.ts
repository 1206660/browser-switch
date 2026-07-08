import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0b0d10",
        panel: "#11151a",
        panel2: "#151a21",
        border: "#252c35",
        muted: "#8a94a3",
        text: "#edf2f7",
        primary: "#3b82f6"
      },
      boxShadow: {
        focus: "0 0 0 1px rgba(59, 130, 246, 0.55)"
      }
    }
  },
  plugins: []
} satisfies Config;

