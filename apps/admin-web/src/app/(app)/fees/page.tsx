'use client';

import { useEffect, useState } from 'react';
import { Button } from '@education-erp/ui';
import { api, ApiError } from '@/lib/api';
import { useAuthStore } from '@/store/auth-store';

interface FeeStructure {
  id: string;
  category: string;
  amount: string;
  frequency: string;
  dueDay: number | null;
  academicYearId: string;
}

interface Invoice {
  id: string;
  category: string;
  amountDue: string;
  amountPaid: string;
  waivedAmount: string;
  status: string;
  dueDate: string;
  student: { studentUid: string; user: { name: string } };
}

interface RefundRequest {
  id: string;
  amount: string;
  reason: string;
  status: string;
  invoice: { id: string };
}

const TABS = ['Structures', 'Invoices', 'Refunds', 'Reports'] as const;
type Tab = (typeof TABS)[number];

export default function FeesPage() {
  const [tab, setTab] = useState<Tab>('Structures');

  return (
    <div>
      <h1 className="text-xl font-semibold">Fees &amp; Finance</h1>

      <div className="mt-4 flex gap-2 border-b">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm ${tab === t ? 'border-b-2 border-blue-600 font-medium text-blue-700' : 'text-gray-500'}`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === 'Structures' && <StructuresTab />}
        {tab === 'Invoices' && <InvoicesTab />}
        {tab === 'Refunds' && <RefundsTab />}
        {tab === 'Reports' && <ReportsTab />}
      </div>
    </div>
  );
}

function StructuresTab() {
  const [structures, setStructures] = useState<FeeStructure[]>([]);
  const [form, setForm] = useState({ academicYearId: '', classId: '', category: 'TUITION', amount: '', frequency: 'MONTHLY', dueDay: '' });
  const [error, setError] = useState<string | null>(null);
  const [genFeeStructureId, setGenFeeStructureId] = useState('');
  const [genDueDate, setGenDueDate] = useState('');
  const [genResult, setGenResult] = useState<string | null>(null);

  function load() {
    api.get<FeeStructure[]>('/api/v1/fees/structures').then(setStructures).catch(console.error);
  }
  useEffect(load, []);

  async function create() {
    setError(null);
    try {
      await api.post('/api/v1/fees/structures', {
        academicYearId: form.academicYearId,
        classId: form.classId || undefined,
        category: form.category,
        amount: Number(form.amount),
        frequency: form.frequency,
        dueDay: form.dueDay ? Number(form.dueDay) : undefined,
      });
      setForm({ ...form, amount: '', dueDay: '' });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create');
    }
  }

  async function generateInvoices() {
    setGenResult(null);
    try {
      const res = await api.post<{ createdCount: number }>('/api/v1/fees/invoices/generate', {
        feeStructureId: genFeeStructureId,
        dueDate: genDueDate,
      });
      setGenResult(`Generated ${res.createdCount} invoice(s).`);
    } catch (err) {
      setGenResult(err instanceof Error ? err.message : 'Failed to generate invoices');
    }
  }

  return (
    <div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-gray-500">
            <th className="py-2">Category</th>
            <th>Amount (BDT)</th>
            <th>Frequency</th>
            <th>Due Day</th>
          </tr>
        </thead>
        <tbody>
          {structures.map((s) => (
            <tr key={s.id} className="border-b">
              <td className="py-2">{s.category}</td>
              <td>{s.amount}</td>
              <td>{s.frequency}</td>
              <td>{s.dueDay ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 max-w-xl space-y-2 rounded-md border p-4">
        <h3 className="font-medium">New Fee Structure</h3>
        <div className="grid grid-cols-2 gap-2">
          <input placeholder="Academic Year ID" value={form.academicYearId} onChange={(e) => setForm({ ...form, academicYearId: e.target.value })} className="rounded-md border px-2 py-1 text-sm" />
          <input placeholder="Class ID (optional)" value={form.classId} onChange={(e) => setForm({ ...form, classId: e.target.value })} className="rounded-md border px-2 py-1 text-sm" />
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="rounded-md border px-2 py-1 text-sm">
            {['ADMISSION', 'TUITION', 'SESSION', 'EXAM', 'TRANSPORT', 'HOSTEL', 'LAB', 'LIBRARY', 'SPORTS', 'DEVELOPMENT', 'OTHER'].map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })} className="rounded-md border px-2 py-1 text-sm">
            {['ONE_TIME', 'MONTHLY', 'TERM', 'YEARLY'].map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
          <input placeholder="Amount" type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="rounded-md border px-2 py-1 text-sm" />
          <input placeholder="Due day (1-31)" type="number" value={form.dueDay} onChange={(e) => setForm({ ...form, dueDay: e.target.value })} className="rounded-md border px-2 py-1 text-sm" />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button onClick={create}>Create Fee Structure</Button>
      </div>

      <div className="mt-4 max-w-xl space-y-2 rounded-md border p-4">
        <h3 className="font-medium">Generate Invoices from a Fee Structure</h3>
        <div className="flex gap-2">
          <input placeholder="Fee Structure ID" value={genFeeStructureId} onChange={(e) => setGenFeeStructureId(e.target.value)} className="flex-1 rounded-md border px-2 py-1 text-sm" />
          <input type="date" value={genDueDate} onChange={(e) => setGenDueDate(e.target.value)} className="rounded-md border px-2 py-1 text-sm" />
          <Button onClick={generateInvoices}>Generate</Button>
        </div>
        {genResult && <p className="text-sm text-gray-600">{genResult}</p>}
      </div>
    </div>
  );
}

function InvoicesTab() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payAmount, setPayAmount] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);

  function load() {
    api.get<Invoice[]>('/api/v1/fees/invoices').then(setInvoices).catch(console.error);
  }
  useEffect(load, []);

  async function collectCash(invoiceId: string) {
    setMessage(null);
    const amount = Number(payAmount[invoiceId]);
    if (!amount) return;
    try {
      await api.post(`/api/v1/fees/invoices/${invoiceId}/pay`, { gateway: 'CASH', amount });
      setMessage('Payment recorded.');
      load();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'Payment failed');
    }
  }

  return (
    <div>
      {message && <p className="mb-2 text-sm text-gray-600">{message}</p>}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-gray-500">
            <th className="py-2">Student</th>
            <th>Category</th>
            <th>Due</th>
            <th>Paid</th>
            <th>Waived</th>
            <th>Status</th>
            <th>Collect (Cash)</th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((inv) => (
            <tr key={inv.id} className="border-b">
              <td className="py-2">{inv.student.user.name} ({inv.student.studentUid})</td>
              <td>{inv.category}</td>
              <td>{inv.amountDue}</td>
              <td>{inv.amountPaid}</td>
              <td>{inv.waivedAmount}</td>
              <td>{inv.status}</td>
              <td>
                {inv.status !== 'PAID' && inv.status !== 'CANCELLED' && (
                  <div className="flex gap-1">
                    <input
                      type="number"
                      placeholder="Amount"
                      value={payAmount[inv.id] ?? ''}
                      onChange={(e) => setPayAmount({ ...payAmount, [inv.id]: e.target.value })}
                      className="w-20 rounded-md border px-1 py-0.5 text-xs"
                    />
                    <Button variant="secondary" onClick={() => collectCash(inv.id)}>
                      Collect
                    </Button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RefundsTab() {
  const [refunds, setRefunds] = useState<RefundRequest[]>([]);
  const [form, setForm] = useState({ invoiceId: '', amount: '', reason: '' });

  function load() {
    api.get<RefundRequest[]>('/api/v1/fees/refunds').then(setRefunds).catch(console.error);
  }
  useEffect(load, []);

  async function request() {
    await api.post('/api/v1/fees/refunds', { invoiceId: form.invoiceId, amount: Number(form.amount), reason: form.reason });
    setForm({ invoiceId: '', amount: '', reason: '' });
    load();
  }

  async function approve(id: string) {
    await api.post(`/api/v1/fees/refunds/${id}/approve`);
    load();
  }

  async function reject(id: string) {
    await api.post(`/api/v1/fees/refunds/${id}/reject`);
    load();
  }

  return (
    <div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-gray-500">
            <th className="py-2">Invoice</th>
            <th>Amount</th>
            <th>Reason</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {refunds.map((r) => (
            <tr key={r.id} className="border-b">
              <td className="py-2">{r.invoice.id}</td>
              <td>{r.amount}</td>
              <td>{r.reason}</td>
              <td>{r.status}</td>
              <td>
                {r.status === 'PENDING' && (
                  <div className="flex gap-2">
                    <button onClick={() => approve(r.id)} className="text-green-600 hover:underline">Approve</button>
                    <button onClick={() => reject(r.id)} className="text-red-600 hover:underline">Reject</button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 max-w-md space-y-2 rounded-md border p-4">
        <h3 className="font-medium">Request Refund</h3>
        <input placeholder="Invoice ID" value={form.invoiceId} onChange={(e) => setForm({ ...form, invoiceId: e.target.value })} className="w-full rounded-md border px-2 py-1 text-sm" />
        <input placeholder="Amount" type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="w-full rounded-md border px-2 py-1 text-sm" />
        <input placeholder="Reason" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} className="w-full rounded-md border px-2 py-1 text-sm" />
        <Button onClick={request}>Submit Request</Button>
      </div>
    </div>
  );
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

function ReportsTab() {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [collection, setCollection] = useState<{ total: number; byGateway: Record<string, number>; count: number } | null>(null);
  const [defaulters, setDefaulters] = useState<{ studentId: string; name: string; studentUid: string; totalDue: number }[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const accessToken = useAuthStore((s) => s.accessToken);

  async function downloadLedger() {
    const res = await fetch(`${API_BASE}/api/v1/fees/reports/ledger/export`, {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    });
    if (!res.ok) return setMessage('Failed to export ledger');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'fee-ledger.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  }

  function loadDefaulters() {
    api.get<typeof defaulters>('/api/v1/fees/reports/defaulters?thresholdDays=0').then(setDefaulters).catch(console.error);
  }

  useEffect(() => {
    api
      .get<{ total: number; byGateway: Record<string, number>; count: number }>(`/api/v1/fees/reports/daily-collection?date=${date}`)
      .then(setCollection)
      .catch(console.error);
  }, [date]);

  useEffect(loadDefaulters, []);

  async function sendReminders() {
    const res = await api.post<{ remindersSent: number }>('/api/v1/fees/reports/defaulters/remind', {});
    setMessage(`Sent ${res.remindersSent} reminder(s).`);
  }

  async function recalculateLateFees() {
    const res = await api.post<{ checked: number; updated: number }>('/api/v1/fees/invoices/recalculate-late-fees', {});
    setMessage(`Checked ${res.checked} invoice(s), updated ${res.updated}.`);
    loadDefaulters();
  }

  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-2 font-medium">Daily Collection</h3>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-md border px-2 py-1 text-sm" />
        {collection && (
          <p className="mt-2 text-sm">
            Total: <strong>{collection.total} BDT</strong> across {collection.count} payment(s) —{' '}
            {Object.entries(collection.byGateway).map(([g, amt]) => `${g}: ${amt}`).join(', ') || 'none'}
          </p>
        )}
      </section>

      <section>
        <div className="mb-2 flex items-center gap-2">
          <h3 className="font-medium">Defaulters (overdue invoices)</h3>
          <Button variant="secondary" onClick={recalculateLateFees}>Recalculate Late Fees</Button>
          <Button variant="secondary" onClick={sendReminders}>Send Reminders</Button>
          <button onClick={downloadLedger} className="text-sm text-blue-600 hover:underline">
            Export Fee Ledger (Excel)
          </button>
        </div>
        {message && <p className="mb-2 text-sm text-gray-600">{message}</p>}
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-gray-500">
              <th className="py-2">Student</th>
              <th>Total Due</th>
            </tr>
          </thead>
          <tbody>
            {defaulters.map((d) => (
              <tr key={d.studentId} className="border-b">
                <td className="py-2">{d.name} ({d.studentUid})</td>
                <td>{d.totalDue}</td>
              </tr>
            ))}
            {defaulters.length === 0 && (
              <tr><td colSpan={2} className="py-2 text-gray-500">No defaulters.</td></tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
