import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx,mdx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          light: "var(--bg-light)",
          dark: "var(--bg-dark)",
        },
        text: {
          primary: "var(--text-primary)",
          secondary: "var(--text-secondary)",
          inverse: "var(--text-inverse)",
        },
        interactive: {
          DEFAULT: "var(--interactive)",
          hover: "var(--interactive-hover)",
          soft: "var(--interactive-soft)",
        },
      },
      borderRadius: {
        apple: "8px",
        capsule: "980px",
      },
      boxShadow: {
        card: "3px 5px 30px rgba(0, 0, 0, 0.22)",
      },
      maxWidth: {
        content: "980px",
        reading: "72ch",
      },
      fontFamily: {
        display: [
          "SF Pro Display",
          "SF Pro Icons",
          "Helvetica Neue",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
        text: [
          "SF Pro Text",
          "SF Pro Icons",
          "Helvetica Neue",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
      },
      letterSpacing: {
        tightDisplay: "-0.28px",
        tightBody: "-0.374px",
        tightCaption: "-0.224px",
      },
    },
  },
  plugins: [],
};

export default config;