import { prisma } from "../lib/prisma";
import { enqueueCommand } from "../lib/command-queue";
import type { DeviceConnector, RawPunch, DeviceUser, DeviceInfo } from "./interface";

// ZKTeco's ADMS protocol is push-only — the device calls us, we never open a
// connection to it. So "pulling" logs really means reading what ADMS has
// already pushed into DevicePunchLog, and "pushing" a command (user sync,
// enrollment, time sync) means queueing a string for the device to pick up
// on its next GET /iclock/getrequest poll (see lib/command-queue.ts).
export const zktecoAdmsConnector: DeviceConnector = {
  name: "ZKTECO_ADMS",

  async testConnection(deviceId) {
    const device = await prisma.device.findUnique({ where: { id: deviceId } });
    if (!device?.last_sync_at) return false;
    // "Online" for a push-only protocol means it has checked in recently.
    return Date.now() - device.last_sync_at.getTime() < 10 * 60 * 1000;
  },

  async pullPunchLogs(deviceId, since) {
    const logs = await prisma.devicePunchLog.findMany({ where: { device_id: deviceId, punch_at: { gte: since } } });
    return logs.map<RawPunch>((l) => ({ device_id: l.device_id, device_user_id: l.device_user_id, punch_at: l.punch_at, punch_type: 0 }));
  },

  async getUserList(deviceId) {
    const logs = await prisma.devicePunchLog.findMany({ where: { device_id: deviceId }, distinct: ["device_user_id"], select: { device_user_id: true } });
    return logs.map<DeviceUser>((l) => ({ device_user_id: l.device_user_id, name: "" }));
  },

  async pushUserList(deviceId, users) {
    const device = await prisma.device.findUnique({ where: { id: deviceId } });
    if (!device?.serial_number) return;
    for (const u of users) {
      enqueueCommand(device.serial_number, `DATA UPDATE USERINFO PIN=${u.device_user_id}\tName=${u.name}`);
    }
  },

  async enrollUser(deviceId, deviceUserId) {
    const device = await prisma.device.findUnique({ where: { id: deviceId } });
    if (!device?.serial_number) return;
    enqueueCommand(device.serial_number, `ENROLL_FP PIN=${deviceUserId}\tFID=0`);
  },

  async deleteUser(deviceId, deviceUserId) {
    const device = await prisma.device.findUnique({ where: { id: deviceId } });
    if (!device?.serial_number) return;
    enqueueCommand(device.serial_number, `DATA DELETE USERINFO PIN=${deviceUserId}`);
  },

  async clearLogs(deviceId, before) {
    const device = await prisma.device.findUnique({ where: { id: deviceId } });
    if (!device?.serial_number) return;
    enqueueCommand(device.serial_number, `CLEAR LOG BEFORE=${before.toISOString()}`);
  },

  async getDeviceInfo(deviceId): Promise<DeviceInfo | null> {
    const device = await prisma.device.findUnique({ where: { id: deviceId } });
    if (!device?.serial_number) return null;
    return { sn: device.serial_number, firmware: device.brand ?? "unknown", time: device.last_sync_at ?? new Date(0) };
  },

  async syncTime(deviceId) {
    const device = await prisma.device.findUnique({ where: { id: deviceId } });
    if (!device?.serial_number) return;
    enqueueCommand(device.serial_number, `SET OPTIONS TimeZone=6`);
  },
};
