/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // The Construction Brand
        brand: {
          orange: "#EA580C",       // Primary buttons, active states
          orangeHover: "#C2410C",
          amber: "#FACC15",        // Accents, warnings, charts
        },
        // The Field & Office (Light Mode)
        surface: {
          light: "#FFFFFF",
          muted: "#F8FAFC",        // Card backgrounds
          border: "#E2E8F0",
        },
        // The Executive Control Room (Dark Mode)
        control: {
          bg: "#0B1220",
          surface: "#0F172A",
          border: "#1E293B",
        },
        text: {
          primary: "#0F172A",
          secondary: "#475569",
          inverted: "#F8FAFC",
        },
      },
      fontFamily: {
        sans: ["Inter", "sans-serif"],
        display: ["Space Grotesk", "sans-serif"], // Big KPI numbers
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};