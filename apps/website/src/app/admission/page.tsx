"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

interface Cycle {
  id: string;
  name: string;
  class: { name_en: string; name_bn?: string };
  open_date: string;
  close_date: string;
  seat_count: number;
  app_fee: number;
  is_open: boolean;
}

export default function AdmissionListPage() {
  const [cycles, setCycles] = useState<Cycle[] | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/api/admission/public/cycles`)
      .then((r) => r.json())
      .then((body) => setCycles(body.data ?? []))
      .catch(() => setCycles([]));
  }, []);

  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="mb-2 text-2xl font-semibold">Online Admission</h1>
      <p className="mb-6 text-sm text-gray-600">Browse currently published admission cycles.</p>

      {cycles === null && <p className="text-sm text-gray-600">Loading...</p>}
      {cycles?.length === 0 && <p className="text-sm text-gray-600">No admission cycles are published right now.</p>}

      <div className="space-y-4">
        {cycles?.map((c) => (
          <div key={c.id} className="rounded-md border p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{c.name}</p>
                <p className="text-sm text-gray-600">{c.class.name_en}</p>
              </div>
              <span className={`rounded-full px-2 py-1 text-xs font-medium ${c.is_open ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                {c.is_open ? "Open" : "Closed"}
              </span>
            </div>
            <p className="mt-2 text-xs text-gray-500">
              {new Date(c.open_date).toLocaleDateString()} – {new Date(c.close_date).toLocaleDateString()} · {c.seat_count} seats · ৳{c.app_fee} application fee
            </p>
            <div className="mt-3 flex gap-4">
              {c.is_open && (
                <Link href={`/admission/${c.id}`} className="text-sm font-medium text-blue-600 hover:underline">
                  Apply Now →
                </Link>
              )}
              <Link href="/admission/status" className="text-sm text-gray-600 hover:underline">
                Check Application Status
              </Link>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
