'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@education-erp/ui';
import { ROLE_LABELS, type UserRole } from '@education-erp/shared-types';
import { api } from '@/lib/api';

interface StaffListItem {
  id: string;
  staffUid: string;
  designation: string;
  user: { name: string; role: UserRole; email: string | null; phone: string | null; status: string };
  department: { name: string } | null;
}

const ASSIGNABLE_ROLES: UserRole[] = [
  'PRINCIPAL', 'VICE_PRINCIPAL', 'EXAM_CONTROLLER', 'HEAD_OF_DEPARTMENT', 'CLASS_TEACHER',
  'SUBJECT_TEACHER', 'ACCOUNTANT', 'LIBRARIAN', 'TRANSPORT_MANAGER', 'HOSTEL_MANAGER', 'IT_ADMIN',
];

export default function StaffPage() {
  const [staff, setStaff] = useState<StaffListItem[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [nameEn, setNameEn] = useState('');
  const [role, setRole] = useState<UserRole>('SUBJECT_TEACHER');
  const [designation, setDesignation] = useState('');
  const [error, setError] = useState<string | null>(null);

  function load() {
    api.get<StaffListItem[]>('/api/v1/staff').then(setStaff).catch(console.error);
  }
  useEffect(load, []);

  async function createStaff() {
    setError(null);
    try {
      await api.post('/api/v1/staff', { nameEn, role, designation });
      setNameEn('');
      setDesignation('');
      setShowForm(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create staff');
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Staff</h1>
        <Button onClick={() => setShowForm((v) => !v)}>{showForm ? 'Cancel' : 'Add staff'}</Button>
      </div>

      {showForm && (
        <div className="mt-4 max-w-md space-y-3 rounded-md border p-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Full name</label>
            <input value={nameEn} onChange={(e) => setNameEn(e.target.value)} className="mt-1 w-full rounded-md border px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Role</label>
            <select value={role} onChange={(e) => setRole(e.target.value as UserRole)} className="mt-1 w-full rounded-md border px-3 py-2 text-sm">
              {ASSIGNABLE_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r].en}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Designation</label>
            <input value={designation} onChange={(e) => setDesignation(e.target.value)} className="mt-1 w-full rounded-md border px-3 py-2 text-sm" />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <p className="text-xs text-gray-500">Default password: changeme123.</p>
          <Button onClick={createStaff}>Create</Button>
        </div>
      )}

      <table className="mt-4 w-full text-sm">
        <thead>
          <tr className="border-b text-left text-gray-500">
            <th className="py-2">Staff ID</th>
            <th>Name</th>
            <th>Role</th>
            <th>Designation</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {staff.map((s) => (
            <tr key={s.id} className="border-b">
              <td className="py-2">
                <Link href={`/staff/${s.id}`} className="text-blue-600 hover:underline">{s.staffUid}</Link>
              </td>
              <td>{s.user.name}</td>
              <td>{ROLE_LABELS[s.user.role]?.en ?? s.user.role}</td>
              <td>{s.designation}</td>
              <td>{s.user.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
