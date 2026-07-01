import 'dotenv/config';
import { createApp } from './app.js';
import { processOutboxEvents } from './jobs/outbox-worker.js';

const port = Number(process.env.PORT ?? 4000);
const app = createApp();

app.listen(port, () => {
  console.log(`core-api listening on http://localhost:${port}`);
});

// Polling outbox drain — see jobs/outbox-worker.ts for why this isn't BullMQ yet.
const OUTBOX_POLL_INTERVAL_MS = 5000;
setInterval(() => {
  processOutboxEvents().catch((err) => console.error('[outbox] poll failed:', err));
}, OUTBOX_POLL_INTERVAL_MS);
