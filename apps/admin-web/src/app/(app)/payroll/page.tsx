'use client';

import { useEffect, useState } from 'react';
import { Button } from '@education-erp/ui';
import { api } from '@/lib/api';

interface PayrollRecord {
  id: string;
  month: number;
  year: number;
  grossAmount: string;
  deductions: string;
  netAmount: string;
  status: string;
  staff: { staffUid: string; user: { name: string } };
}

export default function PayrollPage() {
  const [records, setRecords] = useState<PayrollRecord[]>([]);
  const [staffId, setStaffId] = useState('');
  const [structure, setStructure] = useState({ basic: '', houseRent: '', medical: '', transport: '', providentFund: '' });
  const [runMonth, setRunMonth] = useState(new Date().getMonth() + 1);
  const [runYear, setRunYear] = useState(new Date().getFullYear());
  const [message, setMessage] = useState<string | null>(null);

  function load() {
    api.get<PayrollRecord[]>(`/api/v1/payroll/records?month=${runMonth}&year=${runYear}`).then(setRecords).catch(console.error);
  }
  useEffect(load, [runMonth, runYear]);

  async function saveStructure() {
    setMessage(null);
    try {
      await api.put(`/api/v1/payroll/structures/${staffId}`, {
        basic: Number(structure.basic),
        houseRent: Number(structure.houseRent || 0),
        medical: Number(structure.medical || 0),
        transport: Number(structure.transport || 0),
        providentFund: Number(structure.providentFund || 0),
      });
      setMessage('Salary structure saved.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to save structure');
    }
  }

  async function runPayroll() {
    setMessage(null);
    try {
      const res = await api.post<{ createdCount: number }>('/api/v1/payroll/run', { month: runMonth, year: runYear });
      setMessage(`Generated ${res.createdCount} payroll record(s).`);
      load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Payroll run failed');
    }
  }

  async function process(id: string) {
    await api.post(`/api/v1/payroll/records/${id}/process`);
    load();
  }

  return (
    <div>
      <h1 className="text-xl font-semibold">Payroll</h1>

      <div className="mt-4 max-w-md space-y-2 rounded-md border p-4">
        <h3 className="font-medium">Set Salary Structure</h3>
        <input placeholder="Staff ID" value={staffId} onChange={(e) => setStaffId(e.target.value)} className="w-full rounded-md border px-2 py-1 text-sm" />
        <div className="grid grid-cols-2 gap-2">
          <input placeholder="Basic" type="number" value={structure.basic} onChange={(e) => setStructure({ ...structure, basic: e.target.value })} className="rounded-md border px-2 py-1 text-sm" />
          <input placeholder="House rent" type="number" value={structure.houseRent} onChange={(e) => setStructure({ ...structure, houseRent: e.target.value })} className="rounded-md border px-2 py-1 text-sm" />
          <input placeholder="Medical" type="number" value={structure.medical} onChange={(e) => setStructure({ ...structure, medical: e.target.value })} className="rounded-md border px-2 py-1 text-sm" />
          <input placeholder="Transport" type="number" value={structure.transport} onChange={(e) => setStructure({ ...structure, transport: e.target.value })} className="rounded-md border px-2 py-1 text-sm" />
          <input placeholder="Provident fund" type="number" value={structure.providentFund} onChange={(e) => setStructure({ ...structure, providentFund: e.target.value })} className="rounded-md border px-2 py-1 text-sm" />
        </div>
        <Button onClick={saveStructure}>Save Structure</Button>
      </div>

      <div className="mt-4 flex items-end gap-2">
        <div>
          <label className="block text-sm text-gray-700">Month</label>
          <input type="number" min={1} max={12} value={runMonth} onChange={(e) => setRunMonth(Number(e.target.value))} className="w-20 rounded-md border px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="block text-sm text-gray-700">Year</label>
          <input type="number" value={runYear} onChange={(e) => setRunYear(Number(e.target.value))} className="w-24 rounded-md border px-2 py-1 text-sm" />
        </div>
        <Button onClick={runPayroll}>Run Payroll</Button>
      </div>

      {message && <p className="mt-2 text-sm text-gray-600">{message}</p>}

      <table className="mt-4 w-full text-sm">
        <thead>
          <tr className="border-b text-left text-gray-500">
            <th className="py-2">Staff</th>
            <th>Gross</th>
            <th>Deductions</th>
            <th>Net</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {records.map((r) => (
            <tr key={r.id} className="border-b">
              <td className="py-2">{r.staff.user.name} ({r.staff.staffUid})</td>
              <td>{r.grossAmount}</td>
              <td>{r.deductions}</td>
              <td>{r.netAmount}</td>
              <td>{r.status}</td>
              <td>
                {r.status === 'DRAFT' && (
                  <button onClick={() => process(r.id)} className="text-blue-600 hover:underline">
                    Process
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
