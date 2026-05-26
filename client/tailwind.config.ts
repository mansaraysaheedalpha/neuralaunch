import type { Config } from "tailwindcss";
import typography from "@tailwindcss/typography";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        /* ===== Institute palette ===================================
         * Bound directly to the CSS variables declared on :root in
         * globals.css. These are the canonical tokens going forward.
         * ============================================================ */
        bg: "var(--bg)",
        "bg-2": "var(--bg-2)",
        "bg-3": "var(--bg-3)",
        fg: "var(--fg)",
        "fg-2": "var(--fg-2)",
        "muted-2": "var(--muted-2)",
        rule: "var(--rule)",
        "rule-strong": "var(--rule-strong)",
        accent: {
          DEFAULT: "var(--accent)",
          foreground: "var(--bg)",
        },
        amber: "var(--amber)",
        success: {
          DEFAULT: "var(--success)",
          foreground: "var(--bg)",
        },

        /* ===== Back-compat tokens ==================================
         * Pre-redesign components still reach for `bg-card`,
         * `text-foreground`, `border-border`, `text-muted-foreground`,
         * `bg-primary`, etc. The CSS vars below all alias onto the
         * Institute scale (see globals.css), so these keep rendering
         * sane until Prompt 02 migrates the components.
         * ============================================================ */
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          light: "hsl(var(--primary-light))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "hsl(var(--muted-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius-lg)",
        md: "var(--radius-md)",
        sm: "var(--radius-sm)",
      },
      fontFamily: {
        sans: [
          "var(--font-inter-tight)",
          "system-ui",
          "-apple-system",
          "sans-serif",
        ],
        serif: [
          "var(--font-instrument-serif)",
          "Times New Roman",
          "serif",
        ],
        mono: [
          "var(--font-jetbrains-mono)",
          "ui-monospace",
          "SFMono-Regular",
          "monospace",
        ],
      },
      transitionDuration: {
        fast: "150ms",
        medium: "250ms",
        slow: "400ms",
      },
      transitionTimingFunction: {
        standard: "cubic-bezier(0, 0, 0.2, 1)",
        emphasis: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
      keyframes: {
        "gradient-x": {
          "0%, 100%": {
            "background-size": "200% 200%",
            "background-position": "left center",
          },
          "50%": {
            "background-size": "200% 200%",
            "background-position": "right center",
          },
        },
      },
      animation: {
        "gradient-x": "gradient-x 3s ease infinite",
      },
    },
  },
  plugins: [typography],
};

export default config;
