#!/usr/bin/env node
// Cross-platform wrapper for `pnpm dev`. On Windows, pnpm executes package.json
// scripts via cmd.exe, which has no ulimit/`/dev/null` — a plain
// `ulimit -n 4096 2>/dev/null || true && turbo dev` string fails immediately
// there, before turbo even starts. ulimit only has meaning on Unix (raising
// the open-file-descriptor limit so many concurrent Next.js/tsx watchers
// don't hit it) and must run in the same shell invocation as `turbo dev` to
// take effect, so the platform check has to live here, not in package.json.
const { spawnSync } = require("child_process");

const result =
  process.platform === "win32"
    ? spawnSync("turbo", ["dev"], { stdio: "inherit", shell: true })
    : spawnSync("bash", ["-lc", "ulimit -n 4096 2>/dev/null; exec turbo dev"], { stdio: "inherit" });

process.exit(result.status ?? 1);
