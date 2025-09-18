/** @type {import('tailwindcss').Config} */
module.exports = {
  mode: "jit",
  darkMode: "class",
  content: [
    "./components/**/*.{js,ts,jsx,tsx}",
    "./contents/**/*.{js,ts,jsx,tsx}",
    "./popup/**/*.{js,ts,jsx,tsx}",
    "./assets/**/*.{js,ts,jsx,tsx}",
    "./tabs/**/*.{js,ts,jsx,tsx}",
    "./style.css",
    "./options.tsx"
  ],
  theme: {
    extend: {}
  },
  plugins: []
}
