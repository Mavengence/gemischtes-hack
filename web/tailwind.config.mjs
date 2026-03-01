/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // From design.jpg plaid palette
        plaid: {
          blue: "#5B7DC8",
          "blue-light": "#8BAAE6",
          purple: "#9C40B0",
          "purple-light": "#C070D0",
        },
        accent: {
          DEFAULT: "#F5C000",
          light: "#FFD740",
          dim: "#C49A00",
        },
        // Speaker colors
        felix: {
          DEFAULT: "#5B7DC8",
          light: "#8BAAE6",
        },
        tommi: {
          DEFAULT: "#9C40B0",
          light: "#C070D0",
        },
        // Surfaces — pure black, no purple cast
        surface: {
          DEFAULT: "#0A0A0A",
          50: "#111111",
          100: "#161616",
          200: "#1F1F1F",
          300: "#2A2A2A",
          400: "#383838",
        },
      },
      fontFamily: {
        sans: ["Barlow", "system-ui", "sans-serif"],
        display: ["Barlow Condensed", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
    },
  },
  plugins: [],
};
