"use client";

import Link from "next/link";

const PAGES = [
  { key: "about", label: "About Us" },
  { key: "history", label: "History" },
  { key: "mission_vision", label: "Mission & Vision" },
  { key: "principal_message", label: "Principal's Message" },
  { key: "vice_principal_message", label: "Vice Principal's Message" },
  { key: "chairman_message", label: "Chairman's Message" },
  { key: "facilities", label: "Facilities" },
  { key: "achievements", label: "Achievements" },
  { key: "admission_info", label: "Admission Info" },
];

export default function AboutIndexPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
        <aside className="space-y-1 text-sm">
          {PAGES.map((p) => (
            <Link key={p.key} href={`/about/${p.key}`} className="block rounded-md px-3 py-2 hover:bg-gray-50">
              {p.label}
            </Link>
          ))}
        </aside>
        <div className="md:col-span-3">
          <h1 className="mb-4 text-2xl font-semibold">About Us</h1>
          <p className="text-gray-600">Select a section from the left to learn more about our institution.</p>
        </div>
      </div>
    </main>
  );
}
