import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#0F6A3D", // Deep Tamil Nadu Temple Green
          hover: "#0A4D2B",
          light: "#E8F5EE",
        },
        secondary: {
          DEFAULT: "#E29A13", // Gopuram Gold
          hover: "#B57B0F",
          light: "#FEF7E9",
        },
        success: {
          DEFAULT: "#16A34A",
          hover: "#15803d",
          light: "#f0fdf4",
        },
        warning: {
          DEFAULT: "#D97706",
          hover: "#b45309",
          light: "#fef3c7",
        },
        danger: {
          DEFAULT: "#DC2626",
          hover: "#b91c1c",
          light: "#fef2f2",
        },
        bg: {
          light: "#F8F9FB",
          dark: "#0F1117",
        },
      },
      fontFamily: {
        display: ["var(--font-outfit)", "var(--font-inter)", "ui-sans-serif", "sans-serif"],
        sans: ["var(--font-inter)", "var(--font-noto-tamil)", "ui-sans-serif", "sans-serif"],
        mono: ["var(--font-jetbrains)", "ui-monospace", "monospace"],
        tamil: ["var(--font-noto-tamil)", "sans-serif"],
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic": "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
      },
      boxShadow: {
        glass: "0 8px 32px 0 rgba(0, 0, 0, 0.37)",
        "glass-light": "0 8px 32px 0 rgba(31, 38, 135, 0.07)",
      },
    },
  },
  plugins: [],
};
export default config;

