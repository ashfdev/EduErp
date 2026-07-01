import type { Config } from "tailwindcss";
import { tailwindBase } from "@education-erp/config/tailwind.base";

const config: Config = {
  ...tailwindBase,
  content: ["./src/**/*.{ts,tsx}", "../../packages/ui/src/**/*.{ts,tsx}"],
} as Config;

export default config;
