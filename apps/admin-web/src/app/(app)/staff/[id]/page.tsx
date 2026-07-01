'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ROLE_LABELS, type UserRole } from '@education-erp/shared-types';
import { api } from '@/lib/api';
import { DocumentVault } from '@/components/DocumentVault';
import { useAuthStore } from '@/store/auth-store';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface StaffProfile {
  id: string;
  staffUid: string;
  designation: string;
  photoUrl: string | null;
  employmentType: string;
  joiningDate: string | null;
  user: { name: string; role: UserRole; email: string | null; phone: string | null; status: string };
  department: { name: string } | null;
  assignments: { id: string; subject: { nameEn: string }; section: { name: string; class: { name: string } } }[];
}

export default function StaffProfilePage() {
  const params = useParams<{ id: string }>();
  const [staff, setStaff] = useState<StaffProfile | null>(null);
  const accessToken = useAuthStore((s) => s.accessToken);

  function load() {
    api.get<StaffProfile>(`/api/v1/staff/${params.id}`).then(setStaff).catch(console.error);
  }
  useEffect(load, [params.id]);

  if (!staff) return <p className="text-sm text-gray-500">Loading…</p>;

  async function uploadPhoto(file: File) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('entityType', 'Staff.photo');
    formData.append('entityId', String(params.id));
    const res = await fetch(`${API_BASE}/api/v1/uploads`, {
      method: 'POST',
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      body: formData,
    });
    if (!res.ok) return alert('Photo upload failed');
    const uploaded = await res.json();
    await api.patch(`/api/v1/staff/${params.id}`, { photoUrl: uploaded.url });
    load();
  }

  return (
    <div>
      <div className="flex items-start gap-4">
        {staff.photoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={staff.photoUrl} alt={staff.user.name} className="h-20 w-20 rounded-md object-cover" />
        )}
        <div>
          <h1 className="text-xl font-semibold">{staff.user.name}</h1>
          <p className="text-sm text-gray-500">
            {staff.staffUid} · {ROLE_LABELS[staff.user.role]?.en ?? staff.user.role} · {staff.designation}
          </p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-6">
        <section>
          <h2 className="mb-2 font-medium">Details</h2>
          <dl className="space-y-1 text-sm">
            <Row label="Department" value={staff.department?.name ?? '—'} />
            <Row label="Employment Type" value={staff.employmentType} />
            <Row label="Joining Date" value={staff.joiningDate?.slice(0, 10) ?? '—'} />
            <Row label="Phone" value={staff.user.phone ?? '—'} />
            <Row label="Email" value={staff.user.email ?? '—'} />
          </dl>
        </section>

        <section>
          <h2 className="mb-2 font-medium">Subject Assignments</h2>
          {staff.assignments.length === 0 ? (
            <p className="text-sm text-gray-500">No assignments yet.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {staff.assignments.map((a) => (
                <li key={a.id}>{a.subject.nameEn} — {a.section.class.name} - {a.section.name}</li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="mt-6 max-w-md">
        <h2 className="mb-2 font-medium">Photo</h2>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => e.target.files?.[0] && uploadPhoto(e.target.files[0])}
          className="text-sm"
        />
      </section>

      <section className="mt-6 max-w-md">
        <h2 className="mb-2 font-medium">Documents (NID, TIN, certificates, appointment letter, ...)</h2>
        <DocumentVault entityType="Staff.document" entityId={String(params.id)} />
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b py-1">
      <dt className="text-gray-500">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
