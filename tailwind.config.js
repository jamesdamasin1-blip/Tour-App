/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        primary: "#3b82f6",
        secondary: "#10b981",
        accent: "#f59e0b",
        danger: "#ef4444",
        background: "#f8fafc",
        card: "#ffffff",
        textPrimary: "#0f172a",
        textSecondary: "#64748b"
      }
    },
  },
  plugins: [],
}
