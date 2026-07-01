'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@education-erp/ui';
import { api } from '@/lib/api';

interface ExamListItem {
  id: string;
  name: string;
  type: string;
  startDate: string;
  endDate: string;
  classes: { classId: string }[];
}

const EXAM_TYPES = ['CLASS_TEST', 'HALF_YEARLY', 'ANNUAL', 'TERM_FINAL', 'SEMESTER_FINAL', 'BOARD_REGISTRATION', 'TRIAL'];

export default function ExamsPage() {
  const [exams, setExams] = useState<ExamListItem[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    academicYearId: '', name: '', type: 'HALF_YEARLY', startDate: '', endDate: '',
    markEntryOpen: '', markEntryClose: '', classIds: '', has4thSubjectRule: false,
  });
  const [error, setError] = useState<string | null>(null);

  function load() {
    api.get<ExamListItem[]>('/api/v1/exams').then(setExams).catch(console.error);
  }
  useEffect(load, []);

  async function createExam() {
    setError(null);
    try {
      await api.post('/api/v1/exams', {
        ...form,
        classIds: form.classIds.split(',').map((s) => s.trim()).filter(Boolean),
      });
      setShowForm(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create exam');
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Exams &amp; Results</h1>
        <Button onClick={() => setShowForm((v) => !v)}>{showForm ? 'Cancel' : 'New Exam'}</Button>
      </div>

      {showForm && (
        <div className="mt-4 max-w-xl space-y-2 rounded-md border p-4">
          <input placeholder="Academic Year ID" value={form.academicYearId} onChange={(e) => setForm({ ...form, academicYearId: e.target.value })} className="w-full rounded-md border px-2 py-1 text-sm" />
          <input placeholder="Exam name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-md border px-2 py-1 text-sm" />
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="w-full rounded-md border px-2 py-1 text-sm">
            {EXAM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500">Exam start</label>
              <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className="w-full rounded-md border px-2 py-1 text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-500">Exam end</label>
              <input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} className="w-full rounded-md border px-2 py-1 text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-500">Mark entry opens</label>
              <input type="date" value={form.markEntryOpen} onChange={(e) => setForm({ ...form, markEntryOpen: e.target.value })} className="w-full rounded-md border px-2 py-1 text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-500">Mark entry closes</label>
              <input type="date" value={form.markEntryClose} onChange={(e) => setForm({ ...form, markEntryClose: e.target.value })} className="w-full rounded-md border px-2 py-1 text-sm" />
            </div>
          </div>
          <input placeholder="Class IDs (comma-separated)" value={form.classIds} onChange={(e) => setForm({ ...form, classIds: e.target.value })} className="w-full rounded-md border px-2 py-1 text-sm" />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.has4thSubjectRule} onChange={(e) => setForm({ ...form, has4thSubjectRule: e.target.checked })} />
            Apply 4th-subject GPA rule (BD SSC/HSC)
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button onClick={createExam}>Create Exam</Button>
        </div>
      )}

      <table className="mt-4 w-full text-sm">
        <thead>
          <tr className="border-b text-left text-gray-500">
            <th className="py-2">Name</th>
            <th>Type</th>
            <th>Dates</th>
            <th>Classes</th>
          </tr>
        </thead>
        <tbody>
          {exams.map((e) => (
            <tr key={e.id} className="border-b hover:bg-gray-50">
              <td className="py-2">
                <Link href={`/exams/${e.id}`} className="text-blue-600 hover:underline">{e.name}</Link>
              </td>
              <td>{e.type}</td>
              <td>{e.startDate.slice(0, 10)} – {e.endDate.slice(0, 10)}</td>
              <td>{e.classes.length}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
