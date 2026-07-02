import { Router } from "express";
import { z } from "zod";
import axios from "axios";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { reqParam } from "../../lib/req-param";
import { DEVICE_MANAGE_ROLES } from "../../lib/roles";
import { deviceSchema, enrollUserSchema } from "@education-erp/validators";
import { badRequest, notFound } from "../../lib/errors";

export const devicesRouter = Router();
devicesRouter.use(authenticate, authorize(DEVICE_MANAGE_ROLES));

const DEVICE_SERVICE_URL = process.env.DEVICE_SERVICE_URL ?? "http://localhost:4500";
const DEVICE_SERVICE_SECRET = process.env.DEVICE_SERVICE_SECRET ?? "dev-only-device-secret";

async function callDeviceService(path: string, body: unknown): Promise<{ ok: boolean; data?: unknown }> {
  try {
    const res = await axios.post(`${DEVICE_SERVICE_URL}${path}`, body, {
      headers: { "x-device-service-secret": DEVICE_SERVICE_SECRET },
      timeout: 5000,
    });
    return { ok: true, data: res.data?.data };
  } catch {
    return { ok: false };
  }
}

devicesRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const devices = await prisma.device.findMany({
      include: { _count: { select: { punch_logs: true } } },
      orderBy: { name: "asc" },
    });
    res.json({ success: true, data: devices });
  }),
);

devicesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = deviceSchema.parse(req.body);
    const device = await prisma.device.create({ data: body });
    res.status(201).json({ success: true, data: device });
  }),
);

devicesRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const body = deviceSchema.partial().parse(req.body);
    const device = await prisma.device.update({ where: { id: reqParam(req, "id") }, data: body });
    res.json({ success: true, data: device });
  }),
);

devicesRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await prisma.device.update({ where: { id: reqParam(req, "id") }, data: { is_active: false } });
    res.status(204).send();
  }),
);

devicesRouter.post(
  "/:id/test-connection",
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const device = await prisma.device.findUnique({ where: { id } });
    if (!device) throw notFound("Device not found");

    // ADMS is push-only — "online" means it has checked in recently, not
    // that we can reach out to it (there's usually nothing listening on
    // ip_address:port for a device behind a school's NAT/firewall).
    const online = !!device.last_sync_at && Date.now() - device.last_sync_at.getTime() < 10 * 60 * 1000;
    await prisma.device.update({ where: { id }, data: { status: online ? "ONLINE" : "OFFLINE" } });
    res.json({ success: true, data: { online, last_sync_at: device.last_sync_at } });
  }),
);

devicesRouter.post(
  "/:id/sync-now",
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const device = await prisma.device.findUnique({ where: { id } });
    if (!device) throw notFound("Device not found");

    const result = await callDeviceService("/internal/reconcile", {});
    if (!result.ok) throw badRequest("Device service is not reachable — is it running?");
    res.json({ success: true, data: result.data });
  }),
);

devicesRouter.post(
  "/:id/sync-users",
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const device = await prisma.device.findUnique({ where: { id } });
    if (!device) throw notFound("Device not found");
    if (!device.serial_number) throw badRequest("This device has no serial number configured yet");

    const [students, staff] = await Promise.all([
      prisma.student.findMany({ where: { deleted_at: null, biometric_id: { not: null } }, select: { biometric_id: true, name_en: true } }),
      prisma.staff.findMany({ where: { deleted_at: null, biometric_id: { not: null } }, select: { biometric_id: true, name_en: true } }),
    ]);
    const people = [...students, ...staff];

    let queued = 0;
    for (const p of people) {
      const result = await callDeviceService("/internal/command", {
        serial_number: device.serial_number,
        command: `DATA UPDATE USERINFO PIN=${p.biometric_id}\tName=${p.name_en}`,
      });
      if (result.ok) queued++;
    }

    res.json({ success: true, data: { queued, total: people.length } });
  }),
);

devicesRouter.post(
  "/:id/enroll-user",
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const body = enrollUserSchema.parse(req.body);
    const device = await prisma.device.findUnique({ where: { id } });
    if (!device) throw notFound("Device not found");
    if (!device.serial_number) throw badRequest("This device has no serial number configured yet");

    const person =
      body.person_type === "STUDENT"
        ? await prisma.student.findUnique({ where: { id: body.person_id } })
        : await prisma.staff.findUnique({ where: { id: body.person_id } });
    if (!person) throw notFound(`${body.person_type === "STUDENT" ? "Student" : "Staff"} not found`);
    if (!person.biometric_id) throw badRequest("This person has no biometric_id assigned yet — set one before enrolling on the device");

    const result = await callDeviceService("/internal/command", {
      serial_number: device.serial_number,
      command: `ENROLL_FP PIN=${person.biometric_id}\tFID=0`,
    });
    if (!result.ok) throw badRequest("Device service is not reachable — is it running?");
    res.json({ success: true, data: { queued: true } });
  }),
);

devicesRouter.get(
  "/:id/punch-logs",
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const query = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(200).default(50) }).parse(req.query);
    const [items, total] = await Promise.all([
      prisma.devicePunchLog.findMany({ where: { device_id: id }, orderBy: { punch_at: "desc" }, skip: (query.page - 1) * query.limit, take: query.limit }),
      prisma.devicePunchLog.count({ where: { device_id: id } }),
    ]);
    res.json({ success: true, data: items, meta: { total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) } });
  }),
);

devicesRouter.get(
  "/:id/unmapped",
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    // Unmapped punches stay is_processed=false on purpose (see punch.processor.ts) so
    // the reconciliation job keeps retrying them once the biometric_id is registered —
    // so "unmapped" here means "no person resolved yet", not "processed with no match".
    const logs = await prisma.devicePunchLog.findMany({
      where: { device_id: id, mapped_person_id: null },
      orderBy: { punch_at: "desc" },
      take: 200,
    });
    res.json({ success: true, data: logs });
  }),
);
