import type { Config } from "tailwindcss";
import { tailwindBase } from "@education-erp/config/tailwind.base";

const config: Config = {
  ...tailwindBase,
  content: ["./src/**/*.{ts,tsx}", "../../packages/ui/src/**/*.{ts,tsx}"],
  theme: {
    ...tailwindBase.theme,
    extend: {
      ...tailwindBase.theme?.extend,
      colors: {
        ...tailwindBase.theme?.extend?.colors,
        green: {
          50: "#F0F6FC",
          100: "#A8C4EC",
          200: "#82AADD",
          300: "#5379AE",
          400: "#268CD1",
          500: "#0474C4",
          600: "#055D9D",
          700: "#06457F",
          800: "#2C444C",
          900: "#262B40",
          950: "#151823",
        },
      },
    },
  },
} as Config;

export default config;
