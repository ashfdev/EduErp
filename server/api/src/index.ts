import "dotenv/config";
import { env } from "./lib/env";
import { createApp } from "./app";
import { logger } from "./lib/logger";

const port = env.PORT;
const app = createApp();

app.listen(port, () => {
  logger.info(`API listening on http://localhost:${port}`);
});
