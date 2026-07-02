"use client";

import { useState } from "react";
import Link from "next/link";
import type { Institution } from "@/lib/types";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About" },
  { href: "/notices", label: "Notice Board" },
  { href: "/gallery", label: "Gallery" },
  { href: "/downloads", label: "Downloads" },
  { href: "/admission", label: "Admission" },
  { href: "/contact", label: "Contact" },
];

export function Navbar({ institution }: { institution: Institution | null }) {
  const [open, setOpen] = useState(false);
  const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL ?? "http://localhost:3001";

  return (
    <header className="border-b bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2">
          {institution?.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={institution.logo_url} alt="logo" className="h-10 w-10 rounded object-contain" />
          )}
          <div>
            <p className="font-semibold" style={{ color: "var(--primary)" }}>{institution?.name_en ?? "Institution"}</p>
            {institution?.tagline_en && <p className="text-xs text-gray-500">{institution.tagline_en}</p>}
          </div>
        </Link>

        <nav className="hidden gap-5 text-sm font-medium md:flex">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="text-gray-700 hover:text-[var(--primary)]">
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <Link href="/result" className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50">Result Lookup</Link>
          <a href={portalUrl} target="_blank" rel="noreferrer" className="rounded-md px-3 py-1.5 text-sm text-white" style={{ background: "var(--primary)" }}>
            Portal Login
          </a>
        </div>

        <button className="md:hidden" onClick={() => setOpen((o) => !o)} aria-label="Toggle menu">
          ☰
        </button>
      </div>

      {open && (
        <nav className="flex flex-col gap-1 border-t bg-white p-4 md:hidden">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="rounded-md px-3 py-2 text-sm hover:bg-gray-50" onClick={() => setOpen(false)}>
              {l.label}
            </Link>
          ))}
          <Link href="/result" className="rounded-md px-3 py-2 text-sm hover:bg-gray-50" onClick={() => setOpen(false)}>Result Lookup</Link>
          <a href={portalUrl} target="_blank" rel="noreferrer" className="rounded-md px-3 py-2 text-sm hover:bg-gray-50">Portal Login</a>
        </nav>
      )}
    </header>
  );
}
