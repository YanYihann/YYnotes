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
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
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
