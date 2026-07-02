import express, { type Express } from "express";
import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import { processPunch } from "../processor/punch.processor";
import { popCommand, acknowledgeCommand } from "../lib/command-queue";
import { internalRouter } from "./internal.routes";

// Parses one ATTLOG line: "{device_user_id}\t{date_time}\t{status}\t{punch_type}\t..."
function parseAttlogLine(line: string): { device_user_id: string; punch_at: Date; punch_type: number } | null {
  const fields = line.trim().split("\t");
  if (fields.length < 2) return null;
  const [deviceUserId, dateTime, , punchType] = fields;
  if (!deviceUserId || !dateTime) return null;
  const punchAt = new Date(dateTime.replace(" ", "T"));
  if (Number.isNaN(punchAt.getTime())) return null;
  return { device_user_id: deviceUserId, punch_at: punchAt, punch_type: Number(punchType ?? 0) };
}

async function resolveDeviceBySn(sn: string) {
  let device = await prisma.device.findUnique({ where: { serial_number: sn } });
  if (!device) {
    // First-ever check-in from a device not yet registered in Settings —
    // auto-register it as OFFLINE/inactive so an admin can find and
    // configure it rather than silently dropping its data.
    device = await prisma.device.create({
      data: { name: `Unregistered Device (${sn})`, type: "FINGERPRINT", serial_number: sn, status: "ONLINE", is_active: false },
    });
    logger.warn({ sn }, "auto-registered a previously unknown device — review it in Settings → Devices");
  }
  return device;
}

export function createAdmsServer(): Express {
  const app = express();

  // Scoped to /iclock/* only — mounting this globally would consume the
  // JSON bodies posted to /internal/* below before express.json() there
  // ever saw them (Express body parsers greedily read the stream once).
  const admsTextParser = express.text({ type: "*/*", limit: "5mb" });

  app.use("/internal", internalRouter);

  app.get("/iclock/cdata", async (req, res) => {
    const sn = String(req.query.SN ?? req.query.sn ?? "");
    if (!sn) return res.status(400).send("SN required");
    const device = await resolveDeviceBySn(sn);
    await prisma.device.update({ where: { id: device.id }, data: { status: "ONLINE", last_sync_at: new Date() } });
    res.type("text/plain").send(`GET OPTION FROM: ${sn}`);
  });

  app.post("/iclock/cdata", admsTextParser, async (req, res) => {
    const sn = String(req.query.SN ?? req.query.sn ?? "");
    const table = String(req.query.table ?? "");
    if (!sn) return res.status(400).send("SN required");

    const device = await resolveDeviceBySn(sn);
    await prisma.device.update({ where: { id: device.id }, data: { status: "ONLINE", last_sync_at: new Date() } });

    if (table === "ATTLOG") {
      const body = typeof req.body === "string" ? req.body : "";
      const lines = body.split("\n").filter((l) => l.trim());
      let processed = 0;
      for (const line of lines) {
        const parsed = parseAttlogLine(line);
        if (!parsed) continue;
        await processPunch({ device_id: device.id, device_user_id: parsed.device_user_id, punch_at: parsed.punch_at, punch_type: parsed.punch_type });
        processed++;
      }
      logger.info({ sn, processed, total: lines.length }, "processed ATTLOG push");
      return res.type("text/plain").send(`OK: ${processed}`);
    }

    // OPERLOG / USERPIC / other tables — acknowledged, not deeply parsed.
    res.type("text/plain").send("OK");
  });

  app.get("/iclock/getrequest", async (req, res) => {
    const sn = String(req.query.SN ?? req.query.sn ?? "");
    if (!sn) return res.status(400).send("SN required");
    const command = popCommand(sn);
    res.type("text/plain").send(command ?? "OK");
  });

  app.post("/iclock/devicecmd", admsTextParser, async (req, res) => {
    const body = typeof req.body === "string" ? req.body : "";
    const match = body.match(/ID=(C:\d+)/);
    if (match?.[1]) acknowledgeCommand(match[1]);
    res.type("text/plain").send("OK");
  });

  app.get("/health", (_req, res) => res.json({ success: true, data: { status: "ok" } }));

  return app;
}
