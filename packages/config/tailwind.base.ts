import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";

export const tailwindBase: Partial<Config> = {
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        // Populated by next/font in each app's root layout — never
        // reference bare family names like "Hind Siliguri" here.
        // Those aren't loaded as web fonts unless self-hosted via next/font,
        // and a same-named font already installed locally on a visitor's OS
        // (an icon font, a corrupted font, anything) silently wins instead —
        // this is exactly what happened before this fix: the whole UI
        // rendered in icon glyphs because a different "Inter" was already
        // registered on the machine that loaded it.
        // Digits first: that face only covers 0-9, so every other character falls through to Hind Siliguri.
        sans: ["var(--font-digits)", "var(--font-hind)", "sans-serif"],
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
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        // The fixed forest/lime brand palette, defined in each app's globals.css.
        forest: "hsl(var(--forest))",
        lime: "hsl(var(--lime))",
        ember: "hsl(var(--ember))",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [
    // `flat:` styles apply only under <html data-ui="flat"> (the admin panel), so the
    // shared components keep their current look in the teacher, portal and website apps.
    plugin(({ addVariant }) => {
      addVariant("flat", '[data-ui="flat"] &');
    }),
  ],
};

export default tailwindBase;
