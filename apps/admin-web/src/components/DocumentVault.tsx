'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@education-erp/ui';
import { useAuthStore } from '@/store/auth-store';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface UploadedFile {
  id: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

/** Document vault (gap-fix, PRD §11.1 "document vault: NID copy, TIN, certificates"). */
export function DocumentVault({ entityType, entityId }: { entityType: string; entityId: string }) {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const accessToken = useAuthStore((s) => s.accessToken);

  function load() {
    fetch(`${API_BASE}/api/v1/uploads?entityType=${entityType}&entityId=${entityId}`, {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    })
      .then((r) => r.json())
      .then(setFiles)
      .catch(console.error);
  }
  useEffect(load, [entityType, entityId, accessToken]);

  async function upload() {
    const file = inputRef.current?.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('entityType', entityType);
      formData.append('entityId', entityId);
      const res = await fetch(`${API_BASE}/api/v1/uploads`, {
        method: 'POST',
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
        body: formData,
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Upload failed');
      if (inputRef.current) inputRef.current.value = '';
      load();
    } finally {
      setUploading(false);
    }
  }

  async function openSignedUrl(fileId: string) {
    const res = await fetch(`${API_BASE}/api/v1/uploads/${fileId}/signed-url`, {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    });
    const { url } = await res.json();
    window.open(url, '_blank');
  }

  return (
    <div>
      <ul className="divide-y text-sm">
        {files.map((f) => (
          <li key={f.id} className="flex items-center justify-between py-2">
            <span>{f.mimeType} · {(f.sizeBytes / 1024).toFixed(0)} KB · {f.createdAt.slice(0, 10)}</span>
            <button onClick={() => openSignedUrl(f.id)} className="text-blue-600 hover:underline">View</button>
          </li>
        ))}
        {files.length === 0 && <li className="py-2 text-gray-500">No documents uploaded yet.</li>}
      </ul>
      <div className="mt-2 flex items-center gap-2">
        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="text-sm" />
        <Button variant="secondary" onClick={upload} disabled={uploading}>
          {uploading ? 'Uploading…' : 'Upload'}
        </Button>
      </div>
    </div>
  );
}
