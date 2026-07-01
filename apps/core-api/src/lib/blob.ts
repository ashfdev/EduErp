import { BlobServiceClient, BlobSASPermissions } from '@azure/storage-blob';
import { randomUUID, createHmac } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const containerName = process.env.AZURE_STORAGE_CONTAINER ?? 'uploads';
let cachedClient: BlobServiceClient | null = null;

function isAzureConfigured(): boolean {
  return Boolean(process.env.AZURE_STORAGE_CONNECTION_STRING);
}

function getClient(): BlobServiceClient {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!connectionString) {
    throw new Error('AZURE_STORAGE_CONNECTION_STRING is not configured');
  }
  cachedClient ??= BlobServiceClient.fromConnectionString(connectionString);
  return cachedClient;
}

export interface UploadResult {
  blobKey: string;
  url: string;
}

// Dev/local fallback so uploads work end-to-end without an Azure subscription
// (mirrors the CASH payment gateway pattern — a genuinely working local option
// alongside the real integration, not a fake stub). Not for production use:
// no redundancy, no CDN, lives on local disk under core-api/.
const LOCAL_UPLOADS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'local-uploads');
const LOCAL_URL_SECRET = process.env.LOCAL_STORAGE_SECRET ?? 'dev-local-storage-secret';

function signLocalToken(blobKey: string, expiresAt: number): string {
  return createHmac('sha256', LOCAL_URL_SECRET).update(`${blobKey}:${expiresAt}`).digest('hex');
}

export function verifyLocalToken(blobKey: string, expiresAt: number, token: string): boolean {
  return expiresAt > Date.now() && signLocalToken(blobKey, expiresAt) === token;
}

export function localFilePath(blobKey: string): string {
  return join(LOCAL_UPLOADS_DIR, blobKey);
}

export async function uploadBuffer(
  tenantId: string,
  originalName: string,
  buffer: Buffer,
  mimeType: string,
): Promise<UploadResult> {
  const blobKey = `${tenantId}/${randomUUID()}-${originalName.replace(/[^\w.\-]/g, '_')}`;

  if (!isAzureConfigured()) {
    const filePath = localFilePath(blobKey);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, buffer);
    // Unsigned, always-servable URL — mirrors how the Azure path's `blockBlobClient.url`
    // is also unsigned (works as long as the container allows public blob read, which
    // this codebase doesn't configure either way; same simplification on both paths).
    // Private files should always go through getSignedDownloadUrl instead, regardless
    // of storage backend — that path enforces an expiring token in local mode.
    const base = process.env.PUBLIC_API_BASE_URL ?? `http://localhost:${process.env.PORT ?? 4000}`;
    return { blobKey, url: `${base}/api/v1/uploads/local-file/direct?blobKey=${encodeURIComponent(blobKey)}` };
  }

  const client = getClient();
  const container = client.getContainerClient(containerName);
  await container.createIfNotExists();

  const blockBlobClient = container.getBlockBlobClient(blobKey);
  await blockBlobClient.uploadData(buffer, { blobHTTPHeaders: { blobContentType: mimeType } });

  return { blobKey, url: blockBlobClient.url };
}

export async function getSignedDownloadUrl(blobKey: string, expiresInMinutes = 15): Promise<string> {
  if (!isAzureConfigured()) {
    const expiresAt = Date.now() + expiresInMinutes * 60 * 1000;
    const token = signLocalToken(blobKey, expiresAt);
    // blobKey contains "/" (tenantId/filename) — passed as a query param rather
    // than a path segment to sidestep Express's handling of encoded slashes.
    const base = process.env.PUBLIC_API_BASE_URL ?? `http://localhost:${process.env.PORT ?? 4000}`;
    return `${base}/api/v1/uploads/local-file?blobKey=${encodeURIComponent(blobKey)}&expiresAt=${expiresAt}&token=${token}`;
  }

  const client = getClient();
  const container = client.getContainerClient(containerName);
  const blockBlobClient = container.getBlockBlobClient(blobKey);

  // Requires the connection string to carry an account key (not a bare SAS token) —
  // that's the credential generateSasUrl signs against.
  return blockBlobClient.generateSasUrl({
    permissions: BlobSASPermissions.parse('r'),
    expiresOn: new Date(Date.now() + expiresInMinutes * 60 * 1000),
  });
}
