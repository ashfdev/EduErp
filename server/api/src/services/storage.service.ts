import { BlobServiceClient, BlobSASPermissions } from "@azure/storage-blob";
import { randomUUID, createHmac } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join, dirname, resolve, sep } from "node:path";

const containerName = process.env.AZURE_BLOB_CONTAINER_NAME ?? "education-erp";
let cachedClient: BlobServiceClient | null = null;

function isAzureConfigured(): boolean {
  return Boolean(process.env.AZURE_STORAGE_CONNECTION_STRING);
}

function getClient(): BlobServiceClient {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!connectionString) {
    throw new Error("AZURE_STORAGE_CONNECTION_STRING is not configured");
  }
  cachedClient ??= BlobServiceClient.fromConnectionString(connectionString);
  return cachedClient;
}

export interface UploadResult {
  blobKey: string;
  url: string;
}

// Dev/local fallback so uploads work end-to-end without an Azure subscription.
// Not for production use: no redundancy, no CDN, lives on local disk under server/api/.
const LOCAL_UPLOADS_DIR = join(process.cwd(), "local-uploads");
const LOCAL_URL_SECRET = process.env.LOCAL_STORAGE_SECRET ?? "dev-local-storage-secret";

function signLocalToken(blobKey: string, expiresAt: number): string {
  return createHmac("sha256", LOCAL_URL_SECRET).update(`${blobKey}:${expiresAt}`).digest("hex");
}

export function verifyLocalToken(blobKey: string, expiresAt: number, token: string): boolean {
  return expiresAt > Date.now() && signLocalToken(blobKey, expiresAt) === token;
}

export function localFilePath(blobKey: string): string {
  const resolved = resolve(LOCAL_UPLOADS_DIR, blobKey);
  const root = resolve(LOCAL_UPLOADS_DIR) + sep;
  if (!resolved.startsWith(root)) {
    throw new Error("Invalid blobKey: path traversal outside local-uploads directory");
  }
  return resolved;
}

export async function uploadBuffer(
  category: string,
  originalName: string,
  buffer: Buffer,
  mimeType: string,
): Promise<UploadResult> {
  const blobKey = `${category}/${randomUUID()}-${originalName.replace(/[^\w.-]/g, "_")}`;

  if (!isAzureConfigured()) {
    const filePath = localFilePath(blobKey);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, buffer);
    const base = process.env.API_URL ?? `http://localhost:${process.env.PORT ?? 4000}`;
    return { blobKey, url: `${base}/api/uploads/local-file/direct?blobKey=${encodeURIComponent(blobKey)}` };
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
    const base = process.env.API_URL ?? `http://localhost:${process.env.PORT ?? 4000}`;
    return `${base}/api/uploads/local-file?blobKey=${encodeURIComponent(blobKey)}&expiresAt=${expiresAt}&token=${token}`;
  }

  const client = getClient();
  const container = client.getContainerClient(containerName);
  const blockBlobClient = container.getBlockBlobClient(blobKey);

  return blockBlobClient.generateSasUrl({
    permissions: BlobSASPermissions.parse("r"),
    expiresOn: new Date(Date.now() + expiresInMinutes * 60 * 1000),
  });
}
