// ZKTeco's ADMS protocol is push-based: the device polls us, it never
// accepts an inbound connection. So "sending a command to the device" (sync
// user list, enroll fingerprint, sync time, ...) means queueing a command
// string that the device picks up next time it calls GET /iclock/getrequest.
// In-memory only — fine for a single long-running service process; would
// need to move to Redis for horizontal scaling, matching the same
// "real infra lands with Phase 17's queue work" deferral used elsewhere.
const queues = new Map<string, string[]>();
const pendingAcks = new Map<string, { command: string; queuedAt: Date }>();

let seq = 1;

export function enqueueCommand(deviceSn: string, command: string): string {
  const id = `C:${seq++}`;
  const list = queues.get(deviceSn) ?? [];
  list.push(`${id}\t${command}`);
  queues.set(deviceSn, list);
  pendingAcks.set(id, { command, queuedAt: new Date() });
  return id;
}

export function popCommand(deviceSn: string): string | null {
  const list = queues.get(deviceSn);
  if (!list || !list.length) return null;
  return list.shift() ?? null;
}

export function acknowledgeCommand(commandId: string): void {
  pendingAcks.delete(commandId);
}

export function pendingCount(deviceSn: string): number {
  return queues.get(deviceSn)?.length ?? 0;
}
