import type { Config } from "tailwindcss";

export const tailwindBase: Partial<Config> = {
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        // Populated by next/font/google in each app's root layout — never
        // reference the bare family names "Inter"/"Noto Sans Bengali" here.
        // Those aren't loaded as web fonts unless self-hosted via next/font,
        // and a same-named font already installed locally on a visitor's OS
        // (an icon font, a corrupted font, anything) silently wins instead —
        // this is exactly what happened before this fix: the whole UI
        // rendered in icon glyphs because a different "Inter" was already
        // registered on the machine that loaded it.
        sans: ["var(--font-inter)", "var(--font-noto-bengali)", "sans-serif"],
      },
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
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
};

export default tailwindBase;
