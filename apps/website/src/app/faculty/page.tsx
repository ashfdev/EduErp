"use client";

import { useEffect, useState } from "react";
import { fetchContent } from "@/lib/content-api";

interface FacultyMember {
  id: string;
  name_en: string;
  designation: string;
  photo_url: string | null;
}

export default function FacultyPage() {
  const [grouped, setGrouped] = useState<Record<string, FacultyMember[]>>({});

  useEffect(() => {
    fetchContent<Record<string, FacultyMember[]>>("/faculty").then((d) => setGrouped(d ?? {}));
  }, []);

  const departments = Object.keys(grouped);

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="mb-4 text-2xl font-semibold">Faculty Directory</h1>
      {!departments.length && <p className="text-sm text-gray-500">Faculty directory has not been published yet.</p>}
      {departments.map((dept) => (
        <div key={dept} className="mb-8">
          <h2 className="mb-3 text-lg font-semibold">{dept}</h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {grouped[dept]!.map((m) => (
              <div key={m.id} className="rounded-lg border p-4 text-center">
                <div className="mx-auto mb-2 h-20 w-20 overflow-hidden rounded-full bg-gray-100">
                  {m.photo_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.photo_url} alt={m.name_en} className="h-full w-full object-cover" />
                  )}
                </div>
                <p className="text-sm font-medium">{m.name_en}</p>
                <p className="text-xs text-gray-500">{m.designation}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </main>
  );
}
