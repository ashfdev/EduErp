import type { Config } from "tailwindcss";
import { tailwindBase } from "@education-erp/config/tailwind.base";

const config: Config = {
  ...tailwindBase,
  content: [
    "./src/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}",
  ],
  theme: {
    ...tailwindBase.theme,
    extend: {
      ...tailwindBase.theme?.extend,
      colors: {
        ...tailwindBase.theme?.extend?.colors,
        forest: "hsl(var(--forest))",
        lime: "hsl(var(--lime))",
        ember: "hsl(var(--ember))",
      },
    },
  },
} as Config;

export default config;
