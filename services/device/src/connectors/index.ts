import type { DeviceConnector } from "./interface";
import { zktecoAdmsConnector } from "./zkteco-adms";
import { genericHttpConnector } from "./generic-http";

const CONNECTORS: Record<string, DeviceConnector> = {
  ZKTECO_ADMS: zktecoAdmsConnector,
  GENERIC_HTTP: genericHttpConnector,
};

export function getConnector(brand?: string | null): DeviceConnector {
  if (brand && CONNECTORS[brand]) return CONNECTORS[brand]!;
  return zktecoAdmsConnector;
}

export * from "./interface";
