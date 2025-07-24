/** @type {import('tailwindcss').Config} */
module.exports = {
  mode:"jit",
  darkMode:"class",
  content: [
  "./contents/**/*.{js,ts,jsx,tsx}",
  "./tabs/**/*.{js,ts,jsx,tsx}",
  "./assets/**/*.{js,ts,jsx,tsx}",
  "./popup.tsx",
  "./style.css"
],
  theme: {
    extend: {},
  },
  plugins: [],
}

