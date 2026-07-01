'use client';

import { useEffect, useState } from 'react';
import { Button } from '@education-erp/ui';
import { api } from '@/lib/api';

interface Tenant {
  id: string;
  nameEn: string;
  nameBn: string | null;
  eiin: string | null;
  board: string | null;
  shortCode: string;
  gradingScale: 'BD_BOARD' | 'CGPA_4' | 'CUSTOM';
}

interface AcademicYear {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

interface Shift {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
}

interface Holiday {
  id: string;
  date: string;
  name: string;
  isNationalHoliday: boolean;
}

const TABS = ['Institution', 'Academic Years', 'Shifts', 'Holidays'] as const;
type Tab = (typeof TABS)[number];

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>('Institution');

  return (
    <div>
      <h1 className="text-xl font-semibold">Settings</h1>

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
        {tab === 'Institution' && <InstitutionTab />}
        {tab === 'Academic Years' && <AcademicYearsTab />}
        {tab === 'Shifts' && <ShiftsTab />}
        {tab === 'Holidays' && <HolidaysTab />}
      </div>
    </div>
  );
}

function InstitutionTab() {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get<Tenant>('/api/v1/settings/tenant').then(setTenant).catch(console.error);
  }, []);

  if (!tenant) return <p className="text-sm text-gray-500">Loading…</p>;

  async function save() {
    if (!tenant) return;
    setSaving(true);
    try {
      const updated = await api.patch<Tenant>('/api/v1/settings/tenant', {
        nameEn: tenant.nameEn,
        nameBn: tenant.nameBn ?? undefined,
        eiin: tenant.eiin ?? undefined,
        board: tenant.board ?? undefined,
        gradingScale: tenant.gradingScale,
      });
      setTenant(updated);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-md space-y-3">
      <Field label="Name (English)" value={tenant.nameEn} onChange={(v) => setTenant({ ...tenant, nameEn: v })} />
      <Field label="Name (Bangla)" value={tenant.nameBn ?? ''} onChange={(v) => setTenant({ ...tenant, nameBn: v })} />
      <Field label="EIIN" value={tenant.eiin ?? ''} onChange={(v) => setTenant({ ...tenant, eiin: v })} />
      <Field label="Board" value={tenant.board ?? ''} onChange={(v) => setTenant({ ...tenant, board: v })} />
      <div>
        <label className="block text-sm font-medium text-gray-700">Grading Scale</label>
        <select
          value={tenant.gradingScale}
          onChange={(e) => setTenant({ ...tenant, gradingScale: e.target.value as Tenant['gradingScale'] })}
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="BD_BOARD">BD Board (SSC/HSC, 5.0 GPA scale)</option>
          <option value="CGPA_4">University CGPA (4.0 scale)</option>
          <option value="CUSTOM">Custom (currently falls back to BD Board bands)</option>
        </select>
      </div>
      <Button onClick={save} disabled={saving}>
        {saving ? 'Saving…' : 'Save'}
      </Button>
    </div>
  );
}

function AcademicYearsTab() {
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [label, setLabel] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  function load() {
    api.get<AcademicYear[]>('/api/v1/settings/academic-years').then(setYears).catch(console.error);
  }
  useEffect(load, []);

  async function create() {
    await api.post('/api/v1/settings/academic-years', { label, startDate, endDate });
    setLabel('');
    setStartDate('');
    setEndDate('');
    load();
  }

  async function activate(id: string) {
    await api.post(`/api/v1/settings/academic-years/${id}/activate`);
    load();
  }

  return (
    <div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-gray-500">
            <th className="py-2">Label</th>
            <th>Start</th>
            <th>End</th>
            <th>Active</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {years.map((y) => (
            <tr key={y.id} className="border-b">
              <td className="py-2">{y.label}</td>
              <td>{y.startDate.slice(0, 10)}</td>
              <td>{y.endDate.slice(0, 10)}</td>
              <td>{y.isActive ? '✓' : ''}</td>
              <td>
                {!y.isActive && (
                  <button onClick={() => activate(y.id)} className="text-blue-600 hover:underline">
                    Set active
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 flex gap-2">
        <input placeholder="Label e.g. 2026" value={label} onChange={(e) => setLabel(e.target.value)} className="rounded-md border px-2 py-1 text-sm" />
        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="rounded-md border px-2 py-1 text-sm" />
        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="rounded-md border px-2 py-1 text-sm" />
        <Button onClick={create}>Add</Button>
      </div>
    </div>
  );
}

function ShiftsTab() {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [name, setName] = useState('');
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('12:30');

  function load() {
    api.get<Shift[]>('/api/v1/settings/shifts').then(setShifts).catch(console.error);
  }
  useEffect(load, []);

  async function create() {
    await api.post('/api/v1/settings/shifts', { name, startTime, endTime });
    setName('');
    load();
  }

  return (
    <div>
      <ul className="divide-y text-sm">
        {shifts.map((s) => (
          <li key={s.id} className="py-2">
            {s.name}: {s.startTime}–{s.endTime}
          </li>
        ))}
      </ul>

      <div className="mt-4 flex gap-2">
        <input placeholder="Shift name" value={name} onChange={(e) => setName(e.target.value)} className="rounded-md border px-2 py-1 text-sm" />
        <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="rounded-md border px-2 py-1 text-sm" />
        <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="rounded-md border px-2 py-1 text-sm" />
        <Button onClick={create}>Add</Button>
      </div>
    </div>
  );
}

function HolidaysTab() {
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [date, setDate] = useState('');
  const [name, setName] = useState('');

  function load() {
    api.get<Holiday[]>('/api/v1/settings/holidays').then(setHolidays).catch(console.error);
  }
  useEffect(load, []);

  async function create() {
    await api.post('/api/v1/settings/holidays', { date, name });
    setDate('');
    setName('');
    load();
  }

  async function remove(id: string) {
    await api.delete(`/api/v1/settings/holidays/${id}`);
    load();
  }

  return (
    <div>
      <ul className="divide-y text-sm">
        {holidays.map((h) => (
          <li key={h.id} className="flex items-center justify-between py-2">
            <span>
              {h.date.slice(0, 10)} — {h.name}
            </span>
            <button onClick={() => remove(h.id)} className="text-red-600 hover:underline">
              Remove
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex gap-2">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-md border px-2 py-1 text-sm" />
        <input placeholder="Holiday name" value={name} onChange={(e) => setName(e.target.value)} className="rounded-md border px-2 py-1 text-sm" />
        <Button onClick={create}>Add</Button>
      </div>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
      />
    </div>
  );
}
