'use client';

import { useEffect, useState } from 'react';
import { Button } from '@education-erp/ui';
import { api } from '@/lib/api';

interface SectionOption {
  id: string;
  name: string;
  class: { name: string };
}

interface RosterRow {
  studentId: string;
  studentUid: string;
  rollNo: string | null;
  name: string;
  status: string | null;
  source: string | null;
}

const STATUS_OPTIONS = ['PRESENT', 'ABSENT', 'LATE', 'LEAVE', 'HALF_DAY'] as const;

export default function AttendancePage() {
  const [sections, setSections] = useState<SectionOption[]>([]);
  const [sectionId, setSectionId] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get<SectionOption[]>('/api/v1/academic/sections').then(setSections).catch(console.error);
  }, []);

  function loadRoster() {
    if (!sectionId) return;
    api
      .get<RosterRow[]>(`/api/v1/attendance?sectionId=${sectionId}&date=${date}`)
      .then(setRoster)
      .catch(console.error);
  }

  useEffect(loadRoster, [sectionId, date]);

  function setStatus(studentId: string, status: string) {
    setRoster((rows) => rows.map((r) => (r.studentId === studentId ? { ...r, status } : r)));
  }

  function markAllPresent() {
    setRoster((rows) => rows.map((r) => ({ ...r, status: 'PRESENT' })));
  }

  async function save() {
    setSaving(true);
    try {
      await api.post('/api/v1/attendance/mark', {
        sectionId,
        date,
        records: roster.map((r) => ({ personId: r.studentId, personType: 'STUDENT', status: r.status ?? 'PRESENT' })),
      });
      loadRoster();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h1 className="text-xl font-semibold">Attendance</h1>

      <div className="mt-4 flex gap-3">
        <select value={sectionId} onChange={(e) => setSectionId(e.target.value)} className="rounded-md border px-3 py-2 text-sm">
          <option value="">Select section…</option>
          {sections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.class.name} - {s.name}
            </option>
          ))}
        </select>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-md border px-3 py-2 text-sm" />
        {sectionId && <Button variant="secondary" onClick={markAllPresent}>Mark all present</Button>}
        {sectionId && (
          <Button onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save attendance'}
          </Button>
        )}
      </div>

      {sectionId && (
        <table className="mt-4 w-full text-sm">
          <thead>
            <tr className="border-b text-left text-gray-500">
              <th className="py-2">Roll</th>
              <th>Student</th>
              <th>Status</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {roster.map((r) => (
              <tr key={r.studentId} className="border-b">
                <td className="py-2">{r.rollNo ?? '—'}</td>
                <td>{r.name}</td>
                <td>
                  <select
                    value={r.status ?? ''}
                    onChange={(e) => setStatus(r.studentId, e.target.value)}
                    className="rounded-md border px-2 py-1 text-sm"
                  >
                    <option value="">—</option>
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="text-gray-500">{r.source ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
