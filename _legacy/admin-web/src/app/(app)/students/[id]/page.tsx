'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@education-erp/ui';
import { api, ApiError } from '@/lib/api';
import { DocumentVault } from '@/components/DocumentVault';
import { useAuthStore } from '@/store/auth-store';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface StudentProfile {
  id: string;
  studentUid: string;
  rollNo: string | null;
  status: string;
  dateOfBirth: string | null;
  gender: string | null;
  bloodGroup: string | null;
  photoUrl: string | null;
  chronicConditions: string | null;
  emergencyContact: string | null;
  user: { name: string; email: string | null; phone: string | null };
  guardian: { name: string; relation: string; phone: string | null } | null;
  section: { name: string; class: { name: string }; shift: { name: string } | null } | null;
  academicHistories: {
    id: string;
    status: string;
    rollNo: string | null;
    academicYear: { label: string };
    section: { name: string; class: { name: string } };
  }[];
}

interface DisciplineRecord {
  id: string;
  category: 'INCIDENT' | 'COUNSELING' | 'COMMENDATION';
  description: string;
  actionTaken: string | null;
  occurredAt: string;
}

export default function StudentProfilePage() {
  const params = useParams<{ id: string }>();
  const [student, setStudent] = useState<StudentProfile | null>(null);
  const [health, setHealth] = useState({ chronicConditions: '', emergencyContact: '' });
  const [savingHealth, setSavingHealth] = useState(false);

  const [discipline, setDiscipline] = useState<DisciplineRecord[] | null>(null); // null = not visible to this role
  const [newRecord, setNewRecord] = useState({ category: 'INCIDENT' as const, description: '', actionTaken: '' });
  const accessToken = useAuthStore((s) => s.accessToken);

  function loadStudent() {
    api.get<StudentProfile>(`/api/v1/students/${params.id}`).then((s) => {
      setStudent(s);
      setHealth({ chronicConditions: s.chronicConditions ?? '', emergencyContact: s.emergencyContact ?? '' });
    }).catch(console.error);
  }

  function loadDiscipline() {
    api
      .get<DisciplineRecord[]>(`/api/v1/discipline?studentId=${params.id}`)
      .then(setDiscipline)
      .catch((err) => {
        // 403 means this role (e.g. Subject Teacher) isn't granted discipline:read — expected, hide the section.
        if (!(err instanceof ApiError && err.status === 403)) console.error(err);
      });
  }

  useEffect(() => {
    loadStudent();
    loadDiscipline();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  if (!student) return <p className="text-sm text-gray-500">Loading…</p>;

  async function saveHealth() {
    setSavingHealth(true);
    try {
      await api.patch(`/api/v1/students/${params.id}`, health);
      loadStudent();
    } finally {
      setSavingHealth(false);
    }
  }

  async function addDisciplineRecord() {
    if (!newRecord.description) return;
    await api.post('/api/v1/discipline', { studentId: params.id, ...newRecord });
    setNewRecord({ category: 'INCIDENT', description: '', actionTaken: '' });
    loadDiscipline();
  }

  async function uploadPhoto(file: File) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('entityType', 'Student.photo');
    formData.append('entityId', String(params.id));
    const res = await fetch(`${API_BASE}/api/v1/uploads`, {
      method: 'POST',
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      body: formData,
    });
    if (!res.ok) return alert('Photo upload failed');
    const uploaded = await res.json();
    await api.patch(`/api/v1/students/${params.id}`, { photoUrl: uploaded.url });
    loadStudent();
  }

  return (
    <div>
      <div className="flex items-start gap-4">
        {student.photoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={student.photoUrl} alt={student.user.name} className="h-20 w-20 rounded-md object-cover" />
        )}
        <div>
          <h1 className="text-xl font-semibold">{student.user.name}</h1>
          <p className="text-sm text-gray-500">
            {student.studentUid} · {student.section ? `${student.section.class.name} - ${student.section.name}` : 'Unassigned'}
          </p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-6">
        <section>
          <h2 className="mb-2 font-medium">Personal</h2>
          <dl className="space-y-1 text-sm">
            <Row label="Roll No." value={student.rollNo ?? '—'} />
            <Row label="Status" value={student.status} />
            <Row label="Date of Birth" value={student.dateOfBirth?.slice(0, 10) ?? '—'} />
            <Row label="Gender" value={student.gender ?? '—'} />
            <Row label="Blood Group" value={student.bloodGroup ?? '—'} />
            <Row label="Phone" value={student.user.phone ?? '—'} />
            <Row label="Email" value={student.user.email ?? '—'} />
          </dl>
        </section>

        <section>
          <h2 className="mb-2 font-medium">Guardian</h2>
          {student.guardian ? (
            <dl className="space-y-1 text-sm">
              <Row label="Name" value={student.guardian.name} />
              <Row label="Relation" value={student.guardian.relation} />
              <Row label="Phone" value={student.guardian.phone ?? '—'} />
            </dl>
          ) : (
            <p className="text-sm text-gray-500">No guardian linked.</p>
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
        <h2 className="mb-2 font-medium">Documents (NID, birth certificate, previous marksheet, ...)</h2>
        <DocumentVault entityType="Student.document" entityId={String(params.id)} />
      </section>

      <section className="mt-6 max-w-md">
        <h2 className="mb-2 font-medium">Health Record</h2>
        <div className="space-y-2">
          <div>
            <label className="block text-sm text-gray-700">Chronic conditions</label>
            <input
              value={health.chronicConditions}
              onChange={(e) => setHealth({ ...health, chronicConditions: e.target.value })}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-700">Emergency contact</label>
            <input
              value={health.emergencyContact}
              onChange={(e) => setHealth({ ...health, emergencyContact: e.target.value })}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>
          <Button onClick={saveHealth} disabled={savingHealth} variant="secondary">
            {savingHealth ? 'Saving…' : 'Save health info'}
          </Button>
        </div>
      </section>

      <section className="mt-6">
        <h2 className="mb-2 font-medium">Academic History</h2>
        {student.academicHistories.length === 0 ? (
          <p className="text-sm text-gray-500">No promotion/transfer history yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="py-2">Year</th>
                <th>Class</th>
                <th>Roll</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {student.academicHistories.map((h) => (
                <tr key={h.id} className="border-b">
                  <td className="py-2">{h.academicYear.label}</td>
                  <td>
                    {h.section.class.name} - {h.section.name}
                  </td>
                  <td>{h.rollNo ?? '—'}</td>
                  <td>{h.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {discipline !== null && (
        <section className="mt-6 max-w-2xl">
          <h2 className="mb-2 font-medium">Discipline / Remarks (Admin &amp; Class Teacher only)</h2>
          <ul className="divide-y text-sm">
            {discipline.map((d) => (
              <li key={d.id} className="py-2">
                <span className="font-medium">{d.category}</span> — {d.description}
                {d.actionTaken && <span className="text-gray-500"> (action: {d.actionTaken})</span>}
                <div className="text-xs text-gray-400">{d.occurredAt.slice(0, 10)}</div>
              </li>
            ))}
            {discipline.length === 0 && <li className="py-2 text-gray-500">No records.</li>}
          </ul>

          <div className="mt-3 flex gap-2">
            <select
              value={newRecord.category}
              onChange={(e) => setNewRecord({ ...newRecord, category: e.target.value as never })}
              className="rounded-md border px-2 py-1 text-sm"
            >
              <option value="INCIDENT">Incident</option>
              <option value="COUNSELING">Counseling</option>
              <option value="COMMENDATION">Commendation</option>
            </select>
            <input
              placeholder="Description"
              value={newRecord.description}
              onChange={(e) => setNewRecord({ ...newRecord, description: e.target.value })}
              className="flex-1 rounded-md border px-2 py-1 text-sm"
            />
            <Button onClick={addDisciplineRecord}>Add</Button>
          </div>
        </section>
      )}

      <p className="mt-6 text-xs text-gray-400">
        Fee history and homework tabs land here once those modules ship (Phase 2, Phase 4).
      </p>
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
