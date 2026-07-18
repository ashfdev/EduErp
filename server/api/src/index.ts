import "dotenv/config";
import { env } from "./lib/env";
import { createApp } from "./app";
import { logger } from "./lib/logger";
import { loadPermissionsFromDb } from "./lib/permissions";

const port = env.PORT;

async function start() {
  // Must complete before the server accepts any request — every
  // authorize(SOME_ROLES) call site was already registered (at router
  // import time) holding a reference to roles.ts's array objects; this
  // populates their CONTENTS from the DB before the first real request can
  // be checked against them.
  await loadPermissionsFromDb();
  const app = createApp();
  app.listen(port, () => {
    logger.info(`API listening on http://localhost:${port}`);
  });
}

start().catch((err) => {
  logger.error({ err }, "Failed to start server");
  process.exitCode = 1;
});
