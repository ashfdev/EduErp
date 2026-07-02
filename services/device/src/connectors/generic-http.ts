import axios from "axios";
import { prisma } from "../lib/prisma";
import type { DeviceConnector, RawPunch, DeviceUser, DeviceInfo } from "./interface";

// For non-ADMS devices (RFID readers, GPS trackers) that expose their own
// small HTTP API directly reachable at ip_address:port, rather than pushing
// to us. Best-effort — any unreachable device fails soft (false/[]/null)
// instead of throwing, since these are optional integrations.
async function deviceBaseUrl(deviceId: string): Promise<string | null> {
  const device = await prisma.device.findUnique({ where: { id: deviceId } });
  if (!device?.ip_address) return null;
  return `http://${device.ip_address}:${device.port ?? 80}`;
}

export const genericHttpConnector: DeviceConnector = {
  name: "GENERIC_HTTP",

  async testConnection(_deviceId, ipAddress, port) {
    if (!ipAddress) return false;
    try {
      await axios.get(`http://${ipAddress}:${port ?? 80}/ping`, { timeout: 3000 });
      return true;
    } catch {
      return false;
    }
  },

  async pullPunchLogs(deviceId, since) {
    const base = await deviceBaseUrl(deviceId);
    if (!base) return [];
    try {
      const res = await axios.get(`${base}/logs`, { params: { since: since.toISOString() }, timeout: 5000 });
      const rows = (res.data?.logs ?? []) as { user_id: string; time: string; type?: number }[];
      return rows.map<RawPunch>((r) => ({ device_id: deviceId, device_user_id: r.user_id, punch_at: new Date(r.time), punch_type: r.type ?? 0 }));
    } catch {
      return [];
    }
  },

  async getUserList(deviceId) {
    const base = await deviceBaseUrl(deviceId);
    if (!base) return [];
    try {
      const res = await axios.get(`${base}/users`, { timeout: 5000 });
      return (res.data?.users ?? []) as DeviceUser[];
    } catch {
      return [];
    }
  },

  async pushUserList(deviceId, users) {
    const base = await deviceBaseUrl(deviceId);
    if (!base) return;
    await axios.post(`${base}/users`, { users }, { timeout: 5000 }).catch(() => undefined);
  },

  async enrollUser(deviceId, deviceUserId) {
    const base = await deviceBaseUrl(deviceId);
    if (!base) return;
    await axios.post(`${base}/enroll`, { device_user_id: deviceUserId }, { timeout: 5000 }).catch(() => undefined);
  },

  async deleteUser(deviceId, deviceUserId) {
    const base = await deviceBaseUrl(deviceId);
    if (!base) return;
    await axios.delete(`${base}/users/${deviceUserId}`, { timeout: 5000 }).catch(() => undefined);
  },

  async clearLogs(deviceId, before) {
    const base = await deviceBaseUrl(deviceId);
    if (!base) return;
    await axios.post(`${base}/logs/clear`, { before: before.toISOString() }, { timeout: 5000 }).catch(() => undefined);
  },

  async getDeviceInfo(deviceId): Promise<DeviceInfo | null> {
    const base = await deviceBaseUrl(deviceId);
    if (!base) return null;
    try {
      const res = await axios.get(`${base}/info`, { timeout: 3000 });
      return { sn: res.data?.sn ?? "", firmware: res.data?.firmware ?? "", time: res.data?.time ? new Date(res.data.time) : new Date() };
    } catch {
      return null;
    }
  },

  async syncTime(deviceId) {
    const base = await deviceBaseUrl(deviceId);
    if (!base) return;
    await axios.post(`${base}/sync-time`, { time: new Date().toISOString() }, { timeout: 5000 }).catch(() => undefined);
  },
};
