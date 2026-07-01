const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
export const TENANT_ID = process.env.NEXT_PUBLIC_TENANT_ID ?? '';

export async function getContent<T>(path: string, revalidateSeconds = 30): Promise<T | null> {
  if (!TENANT_ID) return null;
  const separator = path.includes('?') ? '&' : '?';
  const res = await fetch(`${API_BASE}/api/v1/content${path}${separator}tenantId=${TENANT_ID}`, {
    next: { revalidate: revalidateSeconds },
  });
  if (!res.ok) return null;
  return res.json() as Promise<T>;
}

export interface TenantInfo {
  nameEn: string;
  nameBn: string | null;
  tagline: string | null;
  logoUrl: string | null;
  eiin: string | null;
  address: string | null;
  contactPhones: string[] | null;
  contactEmails: string[] | null;
  mapEmbedCode: string | null;
  facebookUrl: string | null;
  youtubeUrl: string | null;
  twitterUrl: string | null;
  linkedinUrl: string | null;
}

export interface NoticeItem {
  id: string;
  title: string;
  body: string;
  isPinned: boolean;
  publishAt: string;
}
