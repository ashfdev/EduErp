export interface RawPunch {
  device_id: string;
  device_user_id: string;
  punch_at: Date;
  punch_type: number; // 0=check-in, 1=check-out, 4=break-out, 5=break-in
  sequence_no?: string;
}

export interface DeviceUser {
  device_user_id: string;
  name: string;
}

export interface DeviceInfo {
  sn: string;
  firmware: string;
  time: Date;
}

export interface DeviceConnector {
  name: string;
  testConnection(deviceId: string, ipAddress: string | null, port: number | null): Promise<boolean>;
  pullPunchLogs(deviceId: string, since: Date): Promise<RawPunch[]>;
  getUserList(deviceId: string): Promise<DeviceUser[]>;
  pushUserList(deviceId: string, users: DeviceUser[]): Promise<void>;
  enrollUser(deviceId: string, deviceUserId: string): Promise<void>;
  deleteUser(deviceId: string, deviceUserId: string): Promise<void>;
  clearLogs(deviceId: string, before: Date): Promise<void>;
  getDeviceInfo(deviceId: string): Promise<DeviceInfo | null>;
  syncTime(deviceId: string): Promise<void>;
}
