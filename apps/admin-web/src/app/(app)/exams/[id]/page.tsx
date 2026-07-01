'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@education-erp/ui';
import { api, ApiError } from '@/lib/api';
import { useAuthStore } from '@/store/auth-store';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface ExamDetail {
  id: string;
  name: string;
  classes: { classId: string }[];
  subjectConfigs: { id: string; classId: string; subjectId: string; fullMarks: number; passMarks: number; isFourthSubject: boolean }[];
}

const TABS = ['Subject Configs', 'Mark Entry', 'Results & Publish'] as const;
type Tab = (typeof TABS)[number];

export default function ExamDetailPage() {
  const params = useParams<{ id: string }>();
  const [exam, setExam] = useState<ExamDetail | null>(null);
  const [tab, setTab] = useState<Tab>('Subject Configs');

  function load() {
    api.get<ExamDetail>(`/api/v1/exams/${params.id}`).then(setExam).catch(console.error);
  }
  useEffect(load, [params.id]);

  if (!exam) return <p className="text-sm text-gray-500">Loading…</p>;

  return (
    <div>
      <h1 className="text-xl font-semibold">{exam.name}</h1>

      <div className="mt-4 flex gap-2 border-b">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-3 py-2 text-sm ${tab === t ? 'border-b-2 border-blue-600 font-medium text-blue-700' : 'text-gray-500'}`}>
            {t}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === 'Subject Configs' && <SubjectConfigsTab examId={exam.id} onChange={load} configs={exam.subjectConfigs} />}
        {tab === 'Mark Entry' && <MarkEntryTab examId={exam.id} />}
        {tab === 'Results & Publish' && <ResultsTab examId={exam.id} classIds={exam.classes.map((c) => c.classId)} />}
      </div>
    </div>
  );
}

function SubjectConfigsTab({ examId, configs, onChange }: { examId: string; configs: ExamDetail['subjectConfigs']; onChange: () => void }) {
  const [form, setForm] = useState({ classId: '', subjectId: '', fullMarks: '100', passMarks: '33', isFourthSubject: false });

  async function add() {
    await api.post(`/api/v1/exams/${examId}/subject-configs`, {
      classId: form.classId, subjectId: form.subjectId,
      fullMarks: Number(form.fullMarks), passMarks: Number(form.passMarks), isFourthSubject: form.isFourthSubject,
    });
    onChange();
  }

  return (
    <div>
      <table className="w-full text-sm">
        <thead><tr className="border-b text-left text-gray-500"><th className="py-2">Class</th><th>Subject</th><th>Full</th><th>Pass</th><th>4th Subject</th></tr></thead>
        <tbody>
          {configs.map((c) => (
            <tr key={c.id} className="border-b">
              <td className="py-2">{c.classId}</td><td>{c.subjectId}</td><td>{c.fullMarks}</td><td>{c.passMarks}</td><td>{c.isFourthSubject ? 'Yes' : 'No'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 max-w-lg space-y-2 rounded-md border p-4">
        <h3 className="font-medium">Add Subject Config</h3>
        <input placeholder="Class ID" value={form.classId} onChange={(e) => setForm({ ...form, classId: e.target.value })} className="w-full rounded-md border px-2 py-1 text-sm" />
        <input placeholder="Subject ID" value={form.subjectId} onChange={(e) => setForm({ ...form, subjectId: e.target.value })} className="w-full rounded-md border px-2 py-1 text-sm" />
        <div className="flex gap-2">
          <input placeholder="Full marks" type="number" value={form.fullMarks} onChange={(e) => setForm({ ...form, fullMarks: e.target.value })} className="w-1/2 rounded-md border px-2 py-1 text-sm" />
          <input placeholder="Pass marks" type="number" value={form.passMarks} onChange={(e) => setForm({ ...form, passMarks: e.target.value })} className="w-1/2 rounded-md border px-2 py-1 text-sm" />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.isFourthSubject} onChange={(e) => setForm({ ...form, isFourthSubject: e.target.checked })} />
          This is the 4th/additional subject
        </label>
        <Button onClick={add}>Add</Button>
      </div>
    </div>
  );
}

interface RosterStudent { id: string; studentUid: string; rollNo: string | null; user: { name: string } }

function MarkEntryTab({ examId }: { examId: string }) {
  const [classId, setClassId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [students, setStudents] = useState<RosterStudent[]>([]);
  const [marks, setMarks] = useState<Record<string, { value: string; absent: boolean }>>({});
  const [message, setMessage] = useState<string | null>(null);

  async function loadRoster() {
    if (!classId) return;
    const list = await api.get<RosterStudent[]>(`/api/v1/students?classId=${classId}`);
    setStudents(list);
  }

  async function saveMarks() {
    setMessage(null);
    try {
      await api.post(`/api/v1/exams/${examId}/marks`, {
        subjectId,
        entries: students.map((s) => ({
          studentId: s.id,
          marksObtained: marks[s.id]?.absent ? undefined : Number(marks[s.id]?.value ?? 0),
          isAbsent: marks[s.id]?.absent ?? false,
        })),
      });
      setMessage('Marks saved as draft.');
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'Failed to save marks');
    }
  }

  async function submitForApproval() {
    await api.post(`/api/v1/exams/${examId}/marks/submit`, { subjectId });
    setMessage('Submitted for approval.');
  }

  async function approve() {
    await api.post(`/api/v1/exams/${examId}/marks/approve`, { subjectId });
    setMessage('Approved.');
  }

  return (
    <div>
      <div className="flex gap-2">
        <input placeholder="Class ID" value={classId} onChange={(e) => setClassId(e.target.value)} className="rounded-md border px-2 py-1 text-sm" />
        <input placeholder="Subject ID" value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className="rounded-md border px-2 py-1 text-sm" />
        <Button variant="secondary" onClick={loadRoster}>Load Roster</Button>
      </div>

      {message && <p className="mt-2 text-sm text-gray-600">{message}</p>}

      {students.length > 0 && (
        <>
          <table className="mt-4 w-full text-sm">
            <thead><tr className="border-b text-left text-gray-500"><th className="py-2">Roll</th><th>Name</th><th>Marks</th><th>Absent</th></tr></thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.id} className="border-b">
                  <td className="py-2">{s.rollNo ?? '—'}</td>
                  <td>{s.user.name}</td>
                  <td>
                    <input
                      type="number"
                      className="w-20 rounded-md border px-1 py-0.5 text-xs"
                      value={marks[s.id]?.value ?? ''}
                      onChange={(e) => setMarks({ ...marks, [s.id]: { value: e.target.value, absent: marks[s.id]?.absent ?? false } })}
                    />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={marks[s.id]?.absent ?? false}
                      onChange={(e) => setMarks({ ...marks, [s.id]: { value: marks[s.id]?.value ?? '', absent: e.target.checked } })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 flex gap-2">
            <Button onClick={saveMarks}>Save Draft</Button>
            <Button variant="secondary" onClick={submitForApproval}>Submit for Approval</Button>
            <Button variant="secondary" onClick={approve}>Approve (Exam Controller)</Button>
          </div>
        </>
      )}
    </div>
  );
}

interface ExamResultRow {
  studentId: string;
  totalMarks: string;
  gpa: string;
  letterGrade: string;
  positionInClass: number | null;
  hasFailed: boolean;
}

function ResultsTab({ examId, classIds }: { examId: string; classIds: string[] }) {
  const [classId, setClassId] = useState(classIds[0] ?? '');
  const [results, setResults] = useState<ExamResultRow[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const accessToken = useAuthStore((s) => s.accessToken);

  async function loadResults() {
    if (!classId) return;
    const list = await api.get<ExamResultRow[]>(`/api/v1/exams/${examId}/results?classId=${classId}`);
    setResults(list);
  }
  useEffect(() => { loadResults(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [classId]);

  async function publish() {
    setMessage(null);
    try {
      const res = await api.post<{ publishedCount: number }>(`/api/v1/exams/${examId}/publish`, { classId });
      setMessage(`Published ${res.publishedCount} result(s).`);
      loadResults();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Publish failed');
    }
  }

  function downloadUrl(path: string) {
    return `${API_BASE}${path}`;
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <select value={classId} onChange={(e) => setClassId(e.target.value)} className="rounded-md border px-2 py-1 text-sm">
          {classIds.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <Button onClick={publish}>Publish Results for This Class</Button>
        <a
          href={downloadUrl(`/api/v1/exams/${examId}/tabulation/${classId}`)}
          target="_blank" rel="noreferrer"
          onClick={(e) => { e.preventDefault(); fetchAndOpen(downloadUrl(`/api/v1/exams/${examId}/tabulation/${classId}`), accessToken); }}
          className="text-sm text-blue-600 hover:underline"
        >
          Download Tabulation Sheet (PDF)
        </a>
      </div>

      {message && <p className="mt-2 text-sm text-gray-600">{message}</p>}

      <table className="mt-4 w-full text-sm">
        <thead><tr className="border-b text-left text-gray-500"><th className="py-2">Student</th><th>Total</th><th>GPA</th><th>Grade</th><th>Position</th><th>Marksheet</th></tr></thead>
        <tbody>
          {results.map((r) => (
            <tr key={r.studentId} className="border-b">
              <td className="py-2">{r.studentId}</td>
              <td>{r.totalMarks}</td>
              <td>{r.gpa}</td>
              <td>{r.hasFailed ? 'F' : r.letterGrade}</td>
              <td>{r.positionInClass ?? '—'}</td>
              <td>
                <button
                  className="text-blue-600 hover:underline"
                  onClick={() => fetchAndOpen(downloadUrl(`/api/v1/exams/${examId}/results/${r.studentId}/marksheet`), accessToken)}
                >
                  Download
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

async function fetchAndOpen(url: string, token: string | null) {
  const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) {
    alert('Failed to generate document');
    return;
  }
  const blob = await res.blob();
  window.open(URL.createObjectURL(blob), '_blank');
}
