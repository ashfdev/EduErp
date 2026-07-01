export type ScanResult = 'CLEAN' | 'INFECTED';

/**
 * Pluggable malware-scan interface (plan §1.A gap-fix: "malware/virus scan on every
 * uploaded file before it lands in Blob storage"). This stub does NOT actually scan
 * anything — it exists only to keep the upload flow's shape correct. Before handling
 * real user uploads in production, wire this to either:
 *   - ClamAV via a REST sidecar (clamav-rest, self-hosted), or
 *   - Azure Defender for Storage (malware scanning add-on on the Blob container)
 * and flip UploadedFile.scanStatus from PENDING to the real result.
 */
export async function scanBuffer(_buffer: Buffer): Promise<ScanResult> {
  return 'CLEAN';
}
