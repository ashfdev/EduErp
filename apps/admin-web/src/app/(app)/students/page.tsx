'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@education-erp/ui';
import { api } from '@/lib/api';

interface StudentListItem {
  id: string;
  studentUid: string;
  rollNo: string | null;
  status: string;
  user: { name: string; phone: string | null; email: string | null };
  section: { name: string } | null;
}

export default function StudentsPage() {
  const [students, setStudents] = useState<StudentListItem[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [nameEn, setNameEn] = useState('');
  const [rollNo, setRollNo] = useState('');
  const [error, setError] = useState<string | null>(null);

  function load() {
    api.get<StudentListItem[]>('/api/v1/students').then(setStudents).catch(console.error);
  }
  useEffect(load, []);

  async function createStudent() {
    setError(null);
    try {
      await api.post('/api/v1/students', { nameEn, rollNo: rollNo || undefined });
      setNameEn('');
      setRollNo('');
      setShowForm(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create student');
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Students</h1>
        <Button onClick={() => setShowForm((v) => !v)}>{showForm ? 'Cancel' : 'Add student'}</Button>
      </div>

      {showForm && (
        <div className="mt-4 max-w-md space-y-3 rounded-md border p-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Full name</label>
            <input value={nameEn} onChange={(e) => setNameEn(e.target.value)} className="mt-1 w-full rounded-md border px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Roll no.</label>
            <input value={rollNo} onChange={(e) => setRollNo(e.target.value)} className="mt-1 w-full rounded-md border px-3 py-2 text-sm" />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <p className="text-xs text-gray-500">Default password: changeme123 (student should change it after first login).</p>
          <Button onClick={createStudent}>Create</Button>
        </div>
      )}

      <table className="mt-4 w-full text-sm">
        <thead>
          <tr className="border-b text-left text-gray-500">
            <th className="py-2">Student ID</th>
            <th>Name</th>
            <th>Roll</th>
            <th>Section</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {students.map((s) => (
            <tr key={s.id} className="border-b hover:bg-gray-50">
              <td className="py-2">
                <Link href={`/students/${s.id}`} className="text-blue-600 hover:underline">
                  {s.studentUid}
                </Link>
              </td>
              <td>{s.user.name}</td>
              <td>{s.rollNo ?? '—'}</td>
              <td>{s.section?.name ?? '—'}</td>
              <td>{s.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
