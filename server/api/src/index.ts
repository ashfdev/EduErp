// Real gap found (2026-08-10): every "local calendar day" calculation in
// this codebase (day-of-week defaults, date-only DB columns via
// lib/date-only.ts, etc.) is written on the documented assumption that
// "this server runs Asia/Dhaka" — but nothing ever actually pinned the
// Node process's timezone. It only happened to be correct in dev because
// this machine's own OS clock is already set to Bangladesh time; a real
// deployment (almost any cloud VM/Docker image) defaults to UTC, which
// would silently shift "today"/day-of-week calculations by a day for part
// of the day (BD midnight–6am is still "yesterday" in UTC). Set explicitly,
// first thing, so correctness never depends on the host's own clock
// config. Single-institution BD app — this is intentionally not
// configurable per CLAUDE.md's "no multi-tenant" scope.
process.env.TZ = "Asia/Dhaka";

import "dotenv/config";
import { env } from "./lib/env";
import { createApp } from "./app";
import { logger } from "./lib/logger";
import { loadPermissionsFromDb } from "./lib/permissions";
import { attachSocketServer } from "./realtime/socket";

const port = env.PORT;

async function start() {
  // Must complete before the server accepts any request — every
  // authorize(SOME_ROLES) call site was already registered (at router
  // import time) holding a reference to roles.ts's array objects; this
  // populates their CONTENTS from the DB before the first real request can
  // be checked against them.
  await loadPermissionsFromDb();
  const app = createApp();
  const httpServer = app.listen(port, () => {
    logger.info(`API listening on http://localhost:${port}`);
  });
  attachSocketServer(httpServer);
}

start().catch((err) => {
  logger.error({ err }, "Failed to start server");
  process.exitCode = 1;
});
