/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: { orange: "#EA580C", orangeHover: "#C2410C", amber: "#FACC15" },
        surface: { light: "#FFFFFF", muted: "#F8FAFC", border: "#E2E8F0" },
        control: { bg: "#0B1220", surface: "#0F172A", border: "#1E293B" },
        text: { primary: "#0F172A", secondary: "#475569", inverted: "#F8FAFC" },
      },
      fontFamily: {
  sans: ["Inter", "Noto Sans Ethiopic", "sans-serif"],
  display: ["Space Grotesk", "Noto Sans Ethiopic", "sans-serif"],
},
    },
  },
  plugins: [],
};