import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    // vitest doesn't load .env itself the way tsx/`dotenv/config` does at
    // runtime — without this, src/lib/env.ts's startup validation sees an
    // empty process.env and calls process.exit(1), killing the whole worker.
    setupFiles: ["./vitest.setup.ts"],
  },
});
